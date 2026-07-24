"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Trash2, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  rsvpCalendarEvent,
  searchCalendarPeople,
  updateCalendarEvent,
  type CalWriteResult,
} from "@/features/integrations/graph/actions";
import type { GraphPerson } from "@/features/integrations/graph/service";
import type { CalendarEventDTO } from "@/features/calendar/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// <input type="datetime-local"> works in the browser's local zone; convert to/from ISO UTC.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}
function defaultStart(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function EventDialog({
  open,
  onOpenChange,
  event,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEventDTO | null; // null = create
  onChanged: () => void;
}) {
  const editing = event != null;
  const externalId = event?.externalId ?? null;

  const [subject, setSubject] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [isOnlineMeeting, setIsOnlineMeeting] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attInput, setAttInput] = useState("");
  const [people, setPeople] = useState<GraphPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced org people search for the attendee picker.
  useEffect(() => {
    const q = attInput.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setPeople([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const res = await searchCalendarPeople(q);
      setPeople(res);
      setSearching(false);
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [attInput]);

  function addAttendee(email: string) {
    const e = email.trim().toLowerCase();
    if (!e || attendees.includes(e)) return;
    setAttendees((prev) => [...prev, e]);
    setAttInput("");
    setPeople([]);
  }
  function removeAttendee(email: string) {
    setAttendees((prev) => prev.filter((a) => a !== email));
  }

  // Reseed the form whenever the dialog opens for a different event (or for create).
  useEffect(() => {
    if (!open) return;
    // Attendees/description aren't carried on the DTO, so editing starts them empty (additive):
    // an empty attendee list is sent as "leave existing invitees untouched" (see eventBody).
    setDescription("");
    setIsOnlineMeeting(false);
    setAttendees([]);
    setAttInput("");
    setPeople([]);
    if (event) {
      setSubject(event.title);
      setStart(toLocalInput(event.start));
      setEnd(toLocalInput(event.end));
      setLocation(event.location ?? "");
      setAllDay(event.allDay);
    } else {
      const s = defaultStart();
      const e = new Date(s.getTime() + 60 * 60 * 1000);
      setSubject("");
      setStart(toLocalInput(s.toISOString()));
      setEnd(toLocalInput(e.toISOString()));
      setLocation("");
      setAllDay(false);
    }
  }, [open, event]);

  function handleResult(res: CalWriteResult, successMsg: string): void {
    if (res.ok) {
      toast.success(successMsg);
      onChanged();
      onOpenChange(false);
      return;
    }
    toast.error(res.error);
  }

  async function handleSave() {
    if (!subject.trim()) {
      toast.error("Add a title.");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      toast.error("End must be after start.");
      return;
    }
    setBusy(true);
    const write = {
      subject: subject.trim(),
      start: fromLocalInput(start),
      end: fromLocalInput(end),
      location: location.trim() || null,
      allDay,
      description: description.trim() || null,
      attendees,
      isOnlineMeeting,
    };
    const res =
      editing && externalId ? await updateCalendarEvent(externalId, write) : await createCalendarEvent(write);
    setBusy(false);
    handleResult(res, editing ? "Event updated." : "Event created.");
  }

  async function handleDelete() {
    if (!externalId) return;
    setBusy(true);
    const res = await deleteCalendarEvent(externalId);
    setBusy(false);
    handleResult(res, "Event deleted.");
  }

  async function handleRsvp(response: "accept" | "tentativelyAccept" | "decline") {
    if (!externalId) return;
    setBusy(true);
    const res = await rsvpCalendarEvent(externalId, response);
    setBusy(false);
    handleResult(res, "Response sent.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-subject">Title</Label>
            <Input id="ev-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Meeting title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start">Start</Label>
              <Input id="ev-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">End</Label>
              <Input id="ev-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-location">Location</Label>
            <Input id="ev-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, address, or link" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-attendees">Attendees</Label>
            {attendees.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {attendees.map((a) => (
                  <span key={a} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {a}
                    <button type="button" onClick={() => removeAttendee(a)} className="hover:text-foreground" aria-label={`Remove ${a}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="relative">
              <Input
                id="ev-attendees"
                value={attInput}
                onChange={(e) => setAttInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && EMAIL_RE.test(attInput.trim())) {
                    e.preventDefault();
                    addAttendee(attInput);
                  }
                }}
                placeholder="Add people by name or email — invites are emailed on save"
                autoComplete="off"
              />
              {attInput.trim().length >= 2 && (searching || people.length > 0 || EMAIL_RE.test(attInput.trim())) ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {searching ? (
                    <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching people…
                    </p>
                  ) : people.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      {EMAIL_RE.test(attInput.trim()) ? "Press Enter to add this email address" : "No people found"}
                    </p>
                  ) : (
                    people.map((p) => (
                      <button
                        key={p.email}
                        type="button"
                        onClick={() => addAttendee(p.email)}
                        className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-accent"
                      >
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.email}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Description</Label>
            <textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Agenda / notes included in the invite"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 rounded border-border" />
              All day
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isOnlineMeeting} onChange={(e) => setIsOnlineMeeting(e.target.checked)} className="size-4 rounded border-border" />
              <Video className="h-3.5 w-3.5 text-primary" /> Teams meeting
            </label>
          </div>

          {editing && externalId ? (
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <p className="text-xs font-medium text-muted-foreground">Respond</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => handleRsvp("accept")} disabled={busy}>
                  <Check className="size-3.5" /> Accept
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleRsvp("tentativelyAccept")} disabled={busy}>
                  Tentative
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleRsvp("decline")} disabled={busy}>
                  <X className="size-3.5" /> Decline
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {editing && externalId ? (
            <Button variant="outline" onClick={handleDelete} disabled={busy} className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
