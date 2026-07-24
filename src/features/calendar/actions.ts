"use server";

import { db } from "@/lib/db";
import { recordNotifications } from "@/features/notifications/actions";

import type { CalendarEventDTO } from "./types";

// Meetings begin reminding this many minutes ahead. (Was a per-feed ICS setting; with Graph
// as the single source there's no config panel, so it's a fixed default — surface it in the
// Graph panel later if per-user tuning is wanted.)
const REMINDER_MINUTES = 15;

function toDTO(row: {
  id: string;
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

// Fire a "starting soon" notification for meetings that begin within the reminder window and
// haven't started yet. Deduped by the event's stable occurrence key, so each meeting reminds
// once. Runs on the same poller as the Graph sync — "reminder" means while the app is open
// (local-first, no server scheduler). Timed events only; all-day rows are skipped.
export async function checkMeetingReminders(): Promise<MeetingReminderResult> {
  const now = new Date();
  const until = new Date(now.getTime() + REMINDER_MINUTES * 60_000);
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
