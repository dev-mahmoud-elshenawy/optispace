"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  rsvpCalendarEvent,
  updateCalendarEvent,
  type CalWriteResult,
} from "@/features/integrations/graph/actions";
import type { CalendarEventDTO } from "@/features/calendar/types";

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
  const [busy, setBusy] = useState(false);

  // Reseed the form whenever the dialog opens for a different event (or for create).
  useEffect(() => {
    if (!open) return;
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 rounded border-border" />
            All day
          </label>

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
