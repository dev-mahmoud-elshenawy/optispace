"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { recordNotifications } from "@/features/notifications/actions";
import { getGraphAuthStatus } from "@/features/integrations/graph/actions";

import { fetchEvents } from "./service";
import { reconcileCalendarEvents } from "./sync-core";
import type { CalendarEventDTO } from "./types";

// ── ICS config (Settings-managed, DB-backed — no .env) ───────────────────────
// The ICS feed is the no-login fallback: a published Outlook calendar URL needs no app
// registration or admin consent (unlike Graph), so it works under locked-down tenants.
// Read-only. When Graph is connected, Graph is the source and the ICS sync skips.
export interface CalendarConfigView {
  icsUrl: string;
  reminderMinutes: number;
}

export async function getCalendarConfig(): Promise<CalendarConfigView> {
  const row = await db.calendarConfig.findUnique({ where: { id: "singleton" } });
  return { icsUrl: row?.icsUrl ?? "", reminderMinutes: row?.reminderMinutes ?? 15 };
}

export async function saveCalendarConfig(
  input: { icsUrl: string; reminderMinutes: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const icsUrl = input.icsUrl.trim();
  // Minimal SSRF/URL hygiene: require http(s) and no embedded credentials. (Full DNS-pinning is
  // disproportionate for a single-user local app where the user configures their own feed.)
  if (icsUrl) {
    let parsed: URL;
    try {
      parsed = new URL(icsUrl);
    } catch {
      return { ok: false, error: "Enter a valid calendar URL." };
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, error: "Calendar URL must start with http:// or https://." };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, error: "Calendar URL must not contain a username or password." };
    }
  }
  const reminderMinutes =
    Number.isFinite(input.reminderMinutes) && input.reminderMinutes > 0 ? Math.round(input.reminderMinutes) : 15;
  const data = { icsUrl: icsUrl || null, reminderMinutes };
  await db.calendarConfig.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  revalidatePath("/settings");
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}

export async function clearCalendarConfig(): Promise<{ ok: true }> {
  await db.calendarConfig.deleteMany({ where: { id: "singleton" } });
  // Drop the ICS-sourced cache so a stale feed's events don't linger after disconnect.
  await db.calendarEvent.updateMany({ where: { source: "ics", deletedAt: null }, data: { deletedAt: new Date() } });
  revalidatePath("/settings");
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}

// ── ICS sync ─────────────────────────────────────────────────────────────────
const WINDOW_BACK_DAYS = 31;
const WINDOW_AHEAD_DAYS = 186;

export type CalendarSyncResult = { ok: true; changed: number } | { ok: false; error: string };

async function recordCalendarHealth(error: string | null): Promise<void> {
  await db.calendarConfig.updateMany({
    where: { id: "singleton" },
    data: error === null ? { lastSyncedAt: new Date(), lastError: null } : { lastError: error },
  });
}

// Fetch the ICS feed and reconcile it into the "ics"-source cache. No-ops when Graph is
// connected (Graph owns the calendar then) or when no feed is configured. Idempotent.
export async function syncCalendar(): Promise<CalendarSyncResult> {
  // Graph precedence: if connected, it's the single source — don't also run ICS (would
  // duplicate meetings under a different source).
  if ((await getGraphAuthStatus()).connected) return { ok: true, changed: 0 };
  const result = await runCalendarSync();
  await recordCalendarHealth(result.ok ? null : result.error);
  return result;
}

async function runCalendarSync(): Promise<CalendarSyncResult> {
  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_BACK_DAYS * 86_400_000);
  const to = new Date(now.getTime() + WINDOW_AHEAD_DAYS * 86_400_000);

  let events;
  try {
    events = await fetchEvents(from, to);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Calendar sync failed." };
  }
  // Unreachable feed / not configured returns []; don't wipe the cache on a transient miss.
  if (events.length === 0) return { ok: true, changed: 0 };

  const changed = await reconcileCalendarEvents("ics", events, now);
  return { ok: true, changed };
}

// ── Reads (source-agnostic) ──────────────────────────────────────────────────
function toDTO(row: {
  id: string;
  externalId: string | null;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  meetingUrl: string | null;
  organizer: string | null;
  attendees: string;
  allDay: boolean;
}): CalendarEventDTO {
  let attendees: string[] = [];
  try {
    attendees = JSON.parse(row.attendees) as string[];
  } catch {
    attendees = [];
  }
  return {
    id: row.id,
    externalId: row.externalId,
    title: row.title,
    start: row.start.toISOString(),
    end: row.end.toISOString(),
    location: row.location,
    meetingUrl: row.meetingUrl,
    allDay: row.allDay,
    organizer: row.organizer,
    attendees,
  };
}

// Read cached events for a range (DB-backed — instant, no network). Client month/day/agenda
// navigation uses this.
export async function getCalendarRange(fromIso: string, toIso: string): Promise<CalendarEventDTO[]> {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  const rows = await db.calendarEvent.findMany({
    where: { deletedAt: null, start: { lte: to }, end: { gte: from } },
    orderBy: { start: "asc" },
  });
  return rows.map(toDTO);
}

export type MeetingReminderResult = { notified: number };

// Fire a "starting soon" notification for meetings that begin within the reminder window
// (from CalendarConfig, default 15) and haven't started. Deduped by occurrence key. Runs on
// the poller — "reminder" means while the app is open (no server scheduler). Timed events only.
export async function checkMeetingReminders(): Promise<MeetingReminderResult> {
  const now = new Date();
  const cfg = await db.calendarConfig.findUnique({ where: { id: "singleton" } });
  const reminderMinutes = cfg?.reminderMinutes ?? 15;
  const until = new Date(now.getTime() + reminderMinutes * 60_000);
  const upcoming = await db.calendarEvent.findMany({
    where: { deletedAt: null, allDay: false, start: { gt: now, lte: until } },
    orderBy: { start: "asc" },
    take: 20,
  });
  if (upcoming.length === 0) return { notified: 0 };

  const notified = await recordNotifications(
    upcoming.map((e) => ({
      type: "meeting_soon" as const,
      externalId: e.id,
      title: e.title,
      url: e.meetingUrl ?? "/calendar",
      message: "",
      project: "Calendar",
      actor: null,
      occurredAt: e.start.toISOString(),
      dedupeKey: `meeting:${e.dedupeKey}`,
    })),
  );
  return { notified };
}
