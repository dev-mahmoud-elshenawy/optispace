import "server-only";

import { PublicClientApplication, type AccountInfo } from "@azure/msal-node";

import { db } from "@/lib/db";
import type { CalendarEventInput } from "@/features/calendar/sync-core";

// Microsoft Graph via MSAL device-code flow (public client — no secret). "common" allows work
// and personal Microsoft accounts. MSAL implicitly requests offline_access, so its token cache
// holds a refresh token and acquireTokenSilent renews the ~1h access token transparently.
const AUTHORITY = "https://login.microsoftonline.com/common";
export const GRAPH_SCOPES = ["User.Read", "Calendars.ReadWrite"];
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export function buildPca(clientId: string): PublicClientApplication {
  return new PublicClientApplication({ auth: { clientId, authority: AUTHORITY } });
}

// Persist MSAL's serialized token cache (+ account identity) to the singleton row. Called
// after every acquire so refreshed tokens survive a restart.
export async function persistGraphCache(
  pca: PublicClientApplication,
  clientId: string,
  account: AccountInfo | null,
): Promise<void> {
  const cache = pca.getTokenCache().serialize();
  const identity = account ? { account: account.username, homeAccountId: account.homeAccountId } : {};
  await db.graphAuth.upsert({
    where: { id: "singleton" },
    update: { clientId, cache, ...identity },
    create: { id: "singleton", clientId, cache, account: account?.username ?? null, homeAccountId: account?.homeAccountId ?? null },
  });
}

// A usable access token via MSAL silent acquisition (refreshes from the cache when expired).
// null = not connected or silent auth failed (caller no-ops), mirroring resolveGithubToken.
export async function resolveGraphToken(): Promise<string | null> {
  const row = await db.graphAuth.findUnique({ where: { id: "singleton" } });
  if (!row?.clientId || !row.homeAccountId || !row.cache) return null;
  try {
    const pca = buildPca(row.clientId);
    pca.getTokenCache().deserialize(row.cache);
    const account = await pca.getTokenCache().getAccountByHomeId(row.homeAccountId);
    if (!account) return null;
    const result = await pca.acquireTokenSilent({ account, scopes: GRAPH_SCOPES });
    // acquireTokenSilent may have refreshed the cache — persist it back.
    await persistGraphCache(pca, row.clientId, account);
    return result?.accessToken ?? null;
  } catch {
    return null;
  }
}

// Authenticated Graph request helper. Returns null when not connected so callers can no-op.
export async function graphFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await resolveGraphToken();
  if (!token) return null;
  return fetch(path.startsWith("http") ? path : `${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

// Raw Graph event shape (only the fields we map).
interface GraphEvent {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string } | null;
  onlineMeetingUrl?: string | null;
  organizer?: { emailAddress?: { name?: string; address?: string } };
  attendees?: Array<{ emailAddress?: { name?: string; address?: string } }>;
}

// With `Prefer: outlook.timezone="UTC"` Graph returns dateTime as a zoneless UTC wall-clock
// string ("2026-07-25T09:00:00.0000000") — append Z to parse it as UTC.
function parseGraphDate(dt?: string): Date {
  if (!dt) return new Date(NaN);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(dt) ? dt : `${dt}Z`);
}

function personName(p?: { name?: string; address?: string }): string | null {
  if (!p) return null;
  return p.name?.trim() || p.address?.trim() || null;
}

function toCalendarInput(ev: GraphEvent): CalendarEventInput {
  return {
    id: ev.id,
    externalId: ev.id,
    title: (ev.subject ?? "(no title)").trim() || "(no title)",
    start: parseGraphDate(ev.start?.dateTime),
    end: parseGraphDate(ev.end?.dateTime),
    location: ev.location?.displayName?.trim() || null,
    meetingUrl: ev.onlineMeeting?.joinUrl?.trim() || ev.onlineMeetingUrl?.trim() || null,
    organizer: personName(ev.organizer?.emailAddress),
    attendees: (ev.attendees ?? []).map((a) => personName(a.emailAddress)).filter((x): x is string => !!x),
    allDay: ev.isAllDay === true,
  };
}

// calendarView expands recurring events server-side over [from, to] (no client RRULE handling).
// Returns null when not connected; throws on an API error so the sync can record health; []
// means genuinely no events. Follows @odata.nextLink pagination.
export async function fetchGraphEvents(from: Date, to: Date): Promise<CalendarEventInput[] | null> {
  const select = "id,subject,start,end,location,isAllDay,isCancelled,onlineMeeting,onlineMeetingUrl,organizer,attendees";
  const params = new URLSearchParams({
    startDateTime: from.toISOString(),
    endDateTime: to.toISOString(),
    $select: select,
    $orderby: "start/dateTime",
    $top: "100",
  });
  let url: string | null = `/me/calendarView?${params.toString()}`;
  const out: CalendarEventInput[] = [];

  while (url) {
    const res = await graphFetch(url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
    if (res === null) return null; // not connected
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Graph calendarView failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { value?: GraphEvent[]; "@odata.nextLink"?: string };
    for (const ev of data.value ?? []) {
      if (ev.isCancelled) continue;
      const mapped = toCalendarInput(ev);
      if (Number.isNaN(mapped.start.getTime())) continue;
      out.push(mapped);
    }
    url = data["@odata.nextLink"] ?? null;
  }

  return out;
}

// ── Writes ───────────────────────────────────────────────────────────────────
export interface GraphEventWrite {
  subject: string;
  description?: string | null;
  start: string; // ISO UTC
  end: string; // ISO UTC
  location?: string | null;
  allDay?: boolean;
}

// Graph wants a zoneless wall-clock dateTime + a separate timeZone; we always send UTC.
function toGraphDateTime(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "");
}

function eventBody(w: GraphEventWrite) {
  return {
    subject: w.subject,
    body: { contentType: "text", content: w.description ?? "" },
    start: { dateTime: toGraphDateTime(w.start), timeZone: "UTC" },
    end: { dateTime: toGraphDateTime(w.end), timeZone: "UTC" },
    location: { displayName: w.location ?? "" },
    isAllDay: w.allDay ?? false,
  };
}

async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const json = JSON.parse(body);
    return json?.error?.message || `Graph request failed (${res.status}).`;
  } catch {
    return body.slice(0, 200) || `Graph request failed (${res.status}).`;
  }
}

// Graph event ids contain characters that must be percent-encoded in a path segment.
function eventPath(id: string): string {
  return `/me/events/${encodeURIComponent(id)}`;
}

const NOT_CONNECTED = "Not connected to Microsoft.";

export async function createGraphEvent(w: GraphEventWrite): Promise<string> {
  const res = await graphFetch("/me/events", { method: "POST", body: JSON.stringify(eventBody(w)) });
  if (res === null) throw new Error(NOT_CONNECTED);
  if (!res.ok) throw new Error(await errorText(res));
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateGraphEvent(id: string, w: GraphEventWrite): Promise<void> {
  const res = await graphFetch(eventPath(id), { method: "PATCH", body: JSON.stringify(eventBody(w)) });
  if (res === null) throw new Error(NOT_CONNECTED);
  if (!res.ok) throw new Error(await errorText(res));
}

export async function deleteGraphEvent(id: string): Promise<void> {
  const res = await graphFetch(eventPath(id), { method: "DELETE" });
  if (res === null) throw new Error(NOT_CONNECTED);
  if (!res.ok && res.status !== 404) throw new Error(await errorText(res));
}

export type GraphRsvp = "accept" | "decline" | "tentativelyAccept";

export async function rsvpGraphEvent(id: string, response: GraphRsvp, comment?: string): Promise<void> {
  const res = await graphFetch(`${eventPath(id)}/${response}`, {
    method: "POST",
    body: JSON.stringify({ sendResponse: true, comment: comment ?? "" }),
  });
  if (res === null) throw new Error(NOT_CONNECTED);
  if (!res.ok) throw new Error(await errorText(res));
}
