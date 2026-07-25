import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

// Normalized event shape for the calendar cache. `id` is the stable dedupe key (the Graph
// event id, unique per expanded occurrence); `externalId` is the Graph event id used for
// write-back.
export interface CalendarEventInput {
  id: string;
  externalId?: string | null;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  meetingUrl: string | null;
  organizer: string | null;
  attendees: string[];
  allDay: boolean;
}

export function calendarFingerprint(e: CalendarEventInput): string {
  return [
    e.title,
    e.start.getTime(),
    e.end.getTime(),
    e.location ?? "",
    e.meetingUrl ?? "",
    e.organizer ?? "",
    e.attendees.join(","),
    e.allDay ? "1" : "0",
  ].join("|");
}

// Reconcile a window of events into the CalendarEvent cache for one source, updating only
// rows whose content changed (fingerprint) and soft-deleting occurrences that vanished from
// the feed. Scoped by `source` so distinct sources never prune each other's rows. Returns the
// number of rows created/updated/pruned. Idempotent.
export async function reconcileCalendarEvents(
  source: "ics" | "graph",
  events: CalendarEventInput[],
  now: Date,
): Promise<number> {
  const existing = await db.calendarEvent.findMany({
    where: { source, deletedAt: null },
    select: { id: true, dedupeKey: true, fingerprint: true },
  });
  const byKey = new Map(existing.map((r) => [r.dedupeKey, r]));
  const seen = new Set<string>();
  let changed = 0;
  const toCreate: Prisma.CalendarEventCreateManyInput[] = [];

  for (const e of events) {
    seen.add(e.id);
    const fp = calendarFingerprint(e);
    const prior = byKey.get(e.id);
    const data = {
      title: e.title,
      start: e.start,
      end: e.end,
      location: e.location,
      meetingUrl: e.meetingUrl,
      organizer: e.organizer,
      attendees: JSON.stringify(e.attendees),
      allDay: e.allDay,
      source,
      externalId: e.externalId ?? null,
      fingerprint: fp,
      deletedAt: null,
    };
    if (!prior) {
      // Collect new rows for one batched insert instead of N round-trips.
      toCreate.push({ dedupeKey: e.id, ...data });
    } else if (prior.fingerprint !== fp) {
      // Updates carry distinct values per row, so they stay individual.
      await db.calendarEvent.update({ where: { id: prior.id }, data });
      changed += 1;
    }
  }

  if (toCreate.length > 0) {
    await db.calendarEvent.createMany({ data: toCreate });
    changed += toCreate.length;
  }

  const stale = existing.filter((r) => !seen.has(r.dedupeKey));
  if (stale.length > 0) {
    await db.calendarEvent.updateMany({ where: { id: { in: stale.map((r) => r.id) } }, data: { deletedAt: now } });
    changed += stale.length;
  }

  return changed;
}
