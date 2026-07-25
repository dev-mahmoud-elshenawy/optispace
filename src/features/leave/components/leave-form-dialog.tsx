"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LEAVE_TYPES, type LeaveType } from "@/types";
import { createLeave, updateLeave } from "../actions";
import type { LeaveView } from "../service";
import { LEAVE_TYPE_LABELS } from "./leave-type-style";

interface LeaveFormDialogProps {
  trigger: ReactNode;
  leave?: LeaveView;
  defaultStart?: string;
  defaultEnd?: string;
}

export function LeaveFormDialog({ trigger, leave, defaultStart, defaultEnd }: LeaveFormDialogProps) {
  const isEdit = Boolean(leave);
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(leave ? format(leave.startDate, "yyyy-MM-dd") : defaultStart ?? "");
  const [endDate, setEndDate] = useState(leave ? format(leave.endDate, "yyyy-MM-dd") : defaultEnd ?? "");
  const [type, setType] = useState<LeaveType>(leave?.type ?? "annual");
  const [halfDay, setHalfDay] = useState(leave?.halfDay ?? false);
  const [notes, setNotes] = useState(leave?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // A half day only makes sense for a single day — disable it for a range.
  const isSingleDay = Boolean(startDate) && startDate === endDate;

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    setError(null);
    if (next && leave) {
      setStartDate(format(leave.startDate, "yyyy-MM-dd"));
      setEndDate(format(leave.endDate, "yyyy-MM-dd"));
      setType(leave.type);
      setHalfDay(leave.halfDay);
      setNotes(leave.notes ?? "");
    } else if (next) {
      // Pre-fill from the calendar's current selection each time it opens.
      setStartDate(defaultStart ?? "");
      setEndDate(defaultEnd ?? "");
      setType("annual");
      setHalfDay(false);
      setNotes("");
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setError(null);
    const input = { startDate, endDate, type, halfDay: isSingleDay && halfDay, notes: notes.trim() || undefined };

    startTransition(async () => {
      const result = isEdit && leave ? await updateLeave(leave.id, input) : await createLeave(input);
      if (result.ok) {
        toast.success(isEdit ? "Leave updated" : "Leave logged");
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit leave" : "Log leave"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update the dates, type, or notes." : "Record a period of leave."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="startDate">Start date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="endDate">End date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="leaveType">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                <SelectTrigger id="leaveType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {LEAVE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm" htmlFor="halfDay">
              <Checkbox
                id="halfDay"
                checked={isSingleDay && halfDay}
                disabled={!isSingleDay}
                onCheckedChange={(v) => setHalfDay(v === true)}
              />
              <span className={isSingleDay ? "" : "text-muted-foreground"}>Half day (counts 0.5)</span>
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isEdit ? "Save changes" : "Log leave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
