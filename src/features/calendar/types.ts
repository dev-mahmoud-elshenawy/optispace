// Client-safe calendar event (dates as ISO strings for serialization across the
// server/client boundary). The server `CalendarEvent` uses real Date objects.
export interface CalendarEventDTO {
  id: string;
  externalId: string | null; // Graph event id — write-back target (edit/delete/RSVP)
  title: string;
  start: string; // ISO
  end: string; // ISO
  location: string | null;
  meetingUrl: string | null;
  allDay: boolean;
  organizer: string | null;
  attendees: string[];
}
