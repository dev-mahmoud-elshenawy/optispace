"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  GRAPH_DEVICE_CODE_URL,
  GRAPH_SCOPES,
  GRAPH_TOKEN_URL,
  fetchGraphAccount,
  graphForm,
  storeGraphToken,
  type GraphTokenResponse,
} from "./service";

export type GraphDeviceStartResult =
  | { ok: true; userCode: string; verificationUri: string; deviceCode: string; interval: number; expiresIn: number }
  | { ok: false; error: string };

export async function graphDeviceStart(clientId: string): Promise<GraphDeviceStartResult> {
  const id = clientId.trim();
  if (!id) return { ok: false, error: "Enter your Microsoft Entra app Client ID first." };
  try {
    const res = await fetch(GRAPH_DEVICE_CODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: graphForm({ client_id: id, scope: GRAPH_SCOPES }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: data.error_description || "Failed to start Microsoft device flow." };
    }
    return {
      ok: true,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      deviceCode: data.device_code,
      interval: data.interval ?? 5,
      expiresIn: data.expires_in ?? 900,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to start Microsoft device flow." };
  }
}

export type GraphDevicePollResult =
  | { ok: true; account: string }
  | { ok: false; pending: boolean; error: string }; // pending → keep polling; else terminal

export async function graphDevicePoll(deviceCode: string, clientId: string): Promise<GraphDevicePollResult> {
  const id = clientId.trim();
  if (!id) return { ok: false, pending: false, error: "Missing Client ID." };
  try {
    const res = await fetch(GRAPH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: graphForm({
        client_id: id,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
      }),
    });
    const data = await res.json();
    if (data.error) {
      // authorization_pending / slow_down = user hasn't finished; anything else is terminal.
      const pending = data.error === "authorization_pending" || data.error === "slow_down";
      return { ok: false, pending, error: data.error_description || data.error };
    }
    const token = data as GraphTokenResponse;
    const account = await fetchGraphAccount(token.access_token);
    await storeGraphToken(token, id, account);
    revalidatePath("/calendar");
    revalidatePath("/settings");
    return { ok: true, account: account ?? "" };
  } catch (error) {
    return { ok: false, pending: false, error: error instanceof Error ? error.message : "Microsoft device poll failed." };
  }
}

export async function graphDisconnect(): Promise<{ ok: true }> {
  await db.graphAuth.deleteMany({ where: { id: "singleton" } });
  // Drop the Graph-sourced calendar cache — without a token the sync can't prune it, and
  // ICS (if configured) takes back over on the next poll. Reconnecting re-syncs.
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
  return { connected: row != null, account: row?.account ?? null };
}
