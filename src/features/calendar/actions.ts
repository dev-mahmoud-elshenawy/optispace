"use server";

import { db } from "@/lib/db";

import { fetchEvents } from "./service";
import type { CalendarEventDTO } from "./types";

// Rolling cache window: sync expands occurrences from 1 month back to 6 months ahead.
const WINDOW_BACK_DAYS = 31;
const WINDOW_AHEAD_DAYS = 186;

function fingerprint(e: {
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  organizer: string | null;
  attendees: string[];
  allDay: boolean;
}): string {
  return [
    e.title,
    e.start.getTime(),
    e.end.getTime(),
    e.location ?? "",
    e.organizer ?? "",
    e.attendees.join(","),
    e.allDay ? "1" : "0",
  ].join("|");
}

export type CalendarSyncResult = { ok: true; changed: number } | { ok: false; error: string };

// Fetch the ICS feed and cache expanded occurrences in the DB, updating only rows
// whose content changed (fingerprint) and soft-deleting occurrences that vanished
// from the feed within the window. Idempotent — safe to run on every poll.
export async function syncCalendar(): Promise<CalendarSyncResult> {
  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_BACK_DAYS * 86_400_000);
  const to = new Date(now.getTime() + WINDOW_AHEAD_DAYS * 86_400_000);

  let events;
  try {
    events = await fetchEvents(from, to);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Calendar sync failed." };
  }
  // If the feed is unreachable it returns []; don't wipe the cache on a transient miss.
  if (events.length === 0) return { ok: true, changed: 0 };

  const existing = await db.calendarEvent.findMany({
    where: { deletedAt: null },
    select: { id: true, dedupeKey: true, fingerprint: true },
  });
  const byKey = new Map(existing.map((r) => [r.dedupeKey, r]));
  const seen = new Set<string>();
  let changed = 0;

  for (const e of events) {
    const dedupeKey = e.id; // service already builds a stable uid(+occurrence) id
    seen.add(dedupeKey);
    const fp = fingerprint(e);
    const prior = byKey.get(dedupeKey);
    const data = {
      title: e.title,
      start: e.start,
      end: e.end,
      location: e.location,
      organizer: e.organizer,
      attendees: JSON.stringify(e.attendees),
      allDay: e.allDay,
      fingerprint: fp,
      deletedAt: null,
    };
    if (!prior) {
      await db.calendarEvent.create({ data: { dedupeKey, ...data } });
      changed += 1;
    } else if (prior.fingerprint !== fp) {
      await db.calendarEvent.update({ where: { id: prior.id }, data });
      changed += 1;
    }
  }

  // Soft-delete cached events that fell out of the feed (cancelled/removed) — but
  // only within the synced window, so past history outside it is left alone.
  const stale = existing.filter((r) => !seen.has(r.dedupeKey));
  if (stale.length > 0) {
    await db.calendarEvent.updateMany({
      where: { id: { in: stale.map((r) => r.id) } },
      data: { deletedAt: now },
    });
    changed += stale.length;
  }

  return { ok: true, changed };
}

function toDTO(row: {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
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
    title: row.title,
    start: row.start.toISOString(),
    end: row.end.toISOString(),
    location: row.location,
    allDay: row.allDay,
    organizer: row.organizer,
    attendees,
  };
}

// Read cached events for a range (DB-backed — instant, no ICS fetch). Client
// month/day navigation uses this.
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
