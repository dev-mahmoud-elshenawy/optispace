import "server-only";

import { db } from "@/lib/db";

import type { CalendarEventDTO } from "./types";

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

// Cached meetings intersecting today (for the dashboard Today card).
export async function todayCalendarEvents(dayStart: Date, dayEnd: Date): Promise<CalendarEventDTO[]> {
  const rows = await db.calendarEvent.findMany({
    where: { deletedAt: null, start: { lte: dayEnd }, end: { gte: dayStart } },
    orderBy: { start: "asc" },
  });
  return rows.map(toDTO);
}
