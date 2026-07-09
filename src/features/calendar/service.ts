import "server-only";

import nodeIcal from "node-ical";

// Calendar via a published ICS feed (Outlook/Teams → Publish calendar → ICS link).
// Per-user, from .env (like Azure DevOps) — never the DB.
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  allDay: boolean;
  organizer: string | null;
  attendees: string[]; // display names (or emails) of invitees
}

export function getCalendarIcsUrl(): string | null {
  return process.env.CALENDAR_ICS_URL?.trim() || null;
}

export function isCalendarEnabled(): boolean {
  return getCalendarIcsUrl() !== null;
}

type IcalPerson = string | { val?: string; params?: { CN?: string } };
type IcalEvent = {
  type: string;
  uid?: string;
  summary?: string;
  location?: string;
  start: Date & { dateOnly?: boolean };
  end?: Date;
  datetype?: string; // "date" for all-day
  organizer?: IcalPerson;
  attendee?: IcalPerson | IcalPerson[];
  rrule?: { between: (after: Date, before: Date, inc?: boolean) => Date[] };
  exdate?: Record<string, Date>;
  recurrences?: Record<string, { summary?: string; location?: string; start: Date; end?: Date }>;
};

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function cleanMailto(v?: string): string | null {
  if (!v) return null;
  return v.replace(/^mailto:/i, "").trim() || null;
}
function personName(p?: IcalPerson): string | null {
  if (!p) return null;
  if (typeof p === "string") return cleanMailto(p);
  return p.params?.CN?.trim() || cleanMailto(p.val);
}
function attendeeNames(a?: IcalPerson | IcalPerson[]): string[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  return arr.map(personName).filter((x): x is string => !!x);
}

// Fetch the ICS feed and expand events (recurring included) overlapping [from, to].
// Returns [] on any failure so the UI degrades quietly.
export async function fetchEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
  const url = getCalendarIcsUrl();
  if (!url) return [];

  let data: Record<string, IcalEvent>;
  try {
    data = (await nodeIcal.async.fromURL(url)) as unknown as Record<string, IcalEvent>;
  } catch {
    return [];
  }

  const out: CalendarEvent[] = [];
  for (const key of Object.keys(data)) {
    const ev = data[key];
    if (!ev || ev.type !== "VEVENT" || !ev.start) continue;
    const allDay = ev.datetype === "date" || ev.start.dateOnly === true;
    const durationMs = Math.max(0, (ev.end?.getTime() ?? ev.start.getTime()) - ev.start.getTime());

    if (ev.rrule) {
      let occurrences: Date[];
      try {
        // Widen the window by the duration so long events that started earlier still show.
        occurrences = ev.rrule.between(new Date(from.getTime() - durationMs), to, true);
      } catch {
        occurrences = [];
      }
      for (const occ of occurrences) {
        const k = dateKey(occ);
        if (ev.exdate && ev.exdate[k]) continue; // cancelled instance
        const override = ev.recurrences?.[k];
        const start = override?.start ?? occ;
        const end = override?.end ?? new Date(start.getTime() + durationMs);
        out.push({
          id: `${ev.uid ?? key}-${occ.getTime()}`,
          title: (override?.summary ?? ev.summary ?? "(no title)").trim(),
          start,
          end,
          location: (override?.location ?? ev.location ?? "").trim() || null,
          allDay,
          organizer: personName(ev.organizer),
          attendees: attendeeNames(ev.attendee),
        });
      }
    } else {
      const start = ev.start;
      const end = ev.end ?? new Date(start.getTime() + durationMs);
      if (end < from || start > to) continue; // outside window
      out.push({
        id: ev.uid ?? key,
        title: (ev.summary ?? "(no title)").trim(),
        start,
        end,
        location: (ev.location ?? "").trim() || null,
        allDay,
        organizer: personName(ev.organizer),
        attendees: attendeeNames(ev.attendee),
      });
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// Meetings that intersect today (local day bounds passed in from the caller).
export async function fetchTodayEvents(dayStart: Date, dayEnd: Date): Promise<CalendarEvent[]> {
  const events = await fetchEvents(dayStart, dayEnd);
  return events.filter((e) => e.end >= dayStart && e.start <= dayEnd);
}
