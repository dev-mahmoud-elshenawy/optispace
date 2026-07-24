"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { reconcileCalendarEvents } from "@/features/calendar/sync-core";
import {
  GRAPH_SCOPES,
  buildPca,
  createGraphEvent,
  deleteGraphEvent,
  fetchGraphEvents,
  persistGraphCache,
  rsvpGraphEvent,
  searchGraphPeople,
  updateGraphEvent,
  type GraphEventWrite,
  type GraphPerson,
  type GraphRsvp,
} from "./service";

// ── Device-flow connect (MSAL) ───────────────────────────────────────────────
// MSAL's acquireTokenByDeviceCode is one blocking call that resolves only after the user
// authorizes — it has no start/poll split. To drive it from a web UI we kick it off, capture
// the user code from its callback, and keep the in-flight acquisition + its outcome in
// module memory so the client can poll for completion. This works because the local dev server
// is a single long-lived process (the deliberate trade-off chosen over a client secret).
type ConnectState = {
  userCode: string;
  verificationUri: string;
  status: "pending" | "done" | "error";
  error?: string;
};
let connect: ConnectState | null = null;

export type GraphConnectStartResult =
  | { ok: true; userCode: string; verificationUri: string }
  | { ok: false; error: string };

export async function graphConnectStart(clientId: string): Promise<GraphConnectStartResult> {
  const id = clientId.trim();
  if (!id) return { ok: false, error: "Enter your Microsoft Entra app Client ID first." };

  const pca = buildPca(id);
  let signalCode: () => void = () => {};
  const codeReady = new Promise<void>((resolve) => {
    signalCode = resolve;
  });
  let codeInfo: { userCode: string; verificationUri: string } | undefined;

  connect = null;
  // Fire-and-forget: the acquisition runs to completion in the background (local process),
  // writing its result to module state; the client polls graphConnectPoll for it.
  pca
    .acquireTokenByDeviceCode({
      scopes: GRAPH_SCOPES,
      deviceCodeCallback: (resp) => {
        codeInfo = { userCode: resp.userCode, verificationUri: resp.verificationUri };
        connect = { userCode: resp.userCode, verificationUri: resp.verificationUri, status: "pending" };
        signalCode();
      },
    })
    .then(async (result) => {
      if (result?.account) {
        await persistGraphCache(pca, id, result.account);
        if (connect) connect.status = "done";
      } else if (connect) {
        connect.status = "error";
        connect.error = "Microsoft returned no account.";
      }
    })
    .catch((e: unknown) => {
      if (connect) {
        connect.status = "error";
        connect.error = e instanceof Error ? e.message : "Microsoft authorization failed.";
      }
    });

  // Wait for MSAL to hand us the user code (fails fast if the device-code request errors).
  await Promise.race([
    codeReady,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Timed out starting device flow.")), 20_000)),
  ]).catch(() => {});

  if (!codeInfo) return { ok: false, error: "Failed to start Microsoft device flow." };
  return { ok: true, userCode: codeInfo.userCode, verificationUri: codeInfo.verificationUri };
}

export type GraphConnectPollResult =
  | { status: "idle" | "pending" | "done" }
  | { status: "error"; error: string };

export async function graphConnectPoll(): Promise<GraphConnectPollResult> {
  if (!connect) return { status: "idle" };
  if (connect.status === "done") {
    connect = null;
    revalidatePath("/calendar");
    revalidatePath("/settings");
    revalidatePath("/");
    return { status: "done" };
  }
  if (connect.status === "error") {
    const error = connect.error ?? "Microsoft authorization failed.";
    connect = null;
    return { status: "error", error };
  }
  return { status: "pending" };
}

export async function graphDisconnect(): Promise<{ ok: true }> {
  connect = null;
  await db.graphAuth.deleteMany({ where: { id: "singleton" } });
  // Drop the Graph-sourced calendar cache — without a token the sync can't prune it.
  await db.calendarEvent.updateMany({ where: { source: "graph", deletedAt: null }, data: { deletedAt: new Date() } });
  revalidatePath("/calendar");
  revalidatePath("/settings");
  return { ok: true };
}

export interface GraphAuthStatus {
  connected: boolean;
  account: string | null;
}

export async function getGraphAuthStatus(): Promise<GraphAuthStatus> {
  const row = await db.graphAuth.findUnique({ where: { id: "singleton" } });
  return { connected: row?.cache != null, account: row?.account ?? null };
}

// ── Calendar sync (Graph is the calendar source) ─────────────────────────────
// Rolling window: 1 month back … 6 months ahead (matches the cached range the UI reads).
const WINDOW_BACK_DAYS = 31;
const WINDOW_AHEAD_DAYS = 186;

export type GraphSyncResult = { ok: true; changed: number } | { ok: false; error: string };

// Record sync health on the GraphAuth singleton (Settings): lastSyncedAt clears lastError on
// success; failure sets lastError and keeps the last good time. updateMany no-ops when absent.
async function recordGraphHealth(error: string | null): Promise<void> {
  await db.graphAuth.updateMany({
    where: { id: "singleton" },
    data: error === null ? { lastSyncedAt: new Date(), lastError: null } : { lastError: error },
  });
}

// Fetch the Graph calendarView window and reconcile it into the CalendarEvent cache. No-ops
// (changed 0) when Graph isn't connected. Idempotent — safe to run on every poll.
export async function syncGraphCalendar(): Promise<GraphSyncResult> {
  const result = await runGraphSync();
  await recordGraphHealth(result.ok ? null : result.error);
  return result;
}

async function runGraphSync(): Promise<GraphSyncResult> {
  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_BACK_DAYS * 86_400_000);
  const to = new Date(now.getTime() + WINDOW_AHEAD_DAYS * 86_400_000);

  let events;
  try {
    events = await fetchGraphEvents(from, to);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Microsoft calendar sync failed." };
  }
  if (events === null) return { ok: true, changed: 0 }; // not connected

  const changed = await reconcileCalendarEvents("graph", events, now);
  return { ok: true, changed };
}

// ── Writes (create / edit / delete / RSVP) ───────────────────────────────────
// Each write hits Graph, then resyncs the cache so the UI reflects it immediately.
export type CalWriteResult = { ok: true } | { ok: false; error: string };

async function afterWrite(): Promise<void> {
  await syncGraphCalendar();
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function createCalendarEvent(w: GraphEventWrite): Promise<CalWriteResult> {
  try {
    await createGraphEvent(w);
    await afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to create event." };
  }
}

export async function updateCalendarEvent(externalId: string, w: GraphEventWrite): Promise<CalWriteResult> {
  try {
    await updateGraphEvent(externalId, w);
    await afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to update event." };
  }
}

export async function deleteCalendarEvent(externalId: string): Promise<CalWriteResult> {
  try {
    await deleteGraphEvent(externalId);
    await afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to delete event." };
  }
}

export async function rsvpCalendarEvent(externalId: string, response: GraphRsvp, comment?: string): Promise<CalWriteResult> {
  try {
    await rsvpGraphEvent(externalId, response, comment);
    await afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to send response." };
  }
}

// Attendee picker: search people relevant to the user (needs People.Read). Best-effort → [].
export async function searchCalendarPeople(query: string): Promise<GraphPerson[]> {
  return searchGraphPeople(query);
}
