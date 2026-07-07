"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LEAVE_TYPES } from "@/types";
import type { LeaveView } from "../service";
import { LeaveFormDialog } from "./leave-form-dialog";
import { LEAVE_TYPE_CELL_CLASS, LEAVE_TYPE_DOT_CLASS, LEAVE_TYPE_LABELS } from "./leave-type-style";

interface LeaveCalendarProps {
  leaves: LeaveView[];
  initialMonth: Date;
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Egypt weekend: Friday (5) and Saturday (6)
const WEEKEND = new Set([5, 6]);

export function LeaveCalendar({ leaves, initialMonth }: LeaveCalendarProps) {
  const today = useMemo(() => new Date(), []);

  // Open on the current month.
  const [month, setMonth] = useState(() => startOfMonth(initialMonth));
  const [pickerOpen, setPickerOpen] = useState(false);

  // Drag-to-select: click a day for single, drag across days for a range.
  const [selStart, setSelStart] = useState<Date | null>(null);
  const [selEnd, setSelEnd] = useState<Date | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [dragging]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month));
    const gridEnd = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  function leaveForDay(day: Date): LeaveView | undefined {
    return leaves.find((leave) => isWithinInterval(day, { start: leave.startDate, end: leave.endDate }));
  }

  const monthLeaveDays = useMemo(
    () => days.filter((day) => isSameMonth(day, month) && leaveForDay(day)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, month, leaves],
  );

  const selRange = useMemo(() => {
    if (!selStart || !selEnd) return null;
    return selStart <= selEnd ? { start: selStart, end: selEnd } : { start: selEnd, end: selStart };
  }, [selStart, selEnd]);

  // Fri/Sat are official days off — exclude them from the selection count and leave dates.
  const selectedWorkdays = useMemo(
    () => (selRange ? eachDayOfInterval(selRange).filter((d) => !WEEKEND.has(d.getDay())) : []),
    [selRange],
  );
  const selectedCount = selectedWorkdays.length;

  function clearSelection() {
    setSelStart(null);
    setSelEnd(null);
  }

  return (
    <div className="select-none">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted"
          >
            <span className="font-heading text-lg font-bold tracking-tight">{format(month, "MMMM yyyy")}</span>
            <ChevronDownIcon className={cn("h-4 w-4 transition-transform", pickerOpen && "rotate-180")} />
          </button>
          <p className="mt-0.5 px-1 text-xs text-muted-foreground">
            {monthLeaveDays} leave {monthLeaveDays === 1 ? "day" : "days"} this month
          </p>

          {pickerOpen ? (
            <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border bg-popover p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => subMonths(m, 12))}>
                  <ChevronLeftIcon />
                  <span className="sr-only">Previous year</span>
                </Button>
                <span className="text-sm font-semibold">{format(month, "yyyy")}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 12))}>
                  <ChevronRightIcon />
                  <span className="sr-only">Next year</span>
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MONTH_LABELS.map((label, idx) => {
                  const active = month.getMonth() === idx;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setMonth(new Date(month.getFullYear(), idx, 1));
                        setPickerOpen(false);
                      }}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-sm transition-colors",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(today))}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => subMonths(m, 1))}>
            <ChevronLeftIcon />
            <span className="sr-only">Previous month</span>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRightIcon />
            <span className="sr-only">Next month</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} className={cn("py-1.5", WEEKEND.has(i) && "text-primary/70")}>
            {label}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const leave = leaveForDay(day);
          const inMonth = isSameMonth(day, month);
          const isToday = isSameDay(day, today);
          const weekend = WEEKEND.has(day.getDay());
          const selected = selRange ? isWithinInterval(day, selRange) && !weekend : false;
          return (
            <div
              key={day.toISOString()}
              title={leave ? `${LEAVE_TYPE_LABELS[leave.type]} leave${leave.notes ? ` — ${leave.notes}` : ""}` : undefined}
              onPointerDown={(e) => {
                if (weekend) return; // official day off — not selectable
                e.preventDefault();
                setSelStart(day);
                setSelEnd(day);
                setDragging(true);
              }}
              onPointerEnter={() => {
                if (dragging) setSelEnd(day);
              }}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors",
                weekend ? "cursor-default" : "cursor-pointer",
                !inMonth && "opacity-40",
                leave
                  ? cn(LEAVE_TYPE_CELL_CLASS[leave.type], "font-semibold")
                  : weekend
                    ? "bg-muted/40 text-muted-foreground"
                    : "hover:bg-muted",
                selected && "bg-primary/25 text-foreground ring-2 ring-primary",
                isToday && !selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}
            >
              {format(day, "d")}
              {leave ? <span className={cn("mt-0.5 h-1 w-1 rounded-full", LEAVE_TYPE_DOT_CLASS[leave.type])} /> : null}
            </div>
          );
        })}
      </div>

      {selectedCount > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span>
            <span className="font-semibold text-primary">{selectedCount}</span> working day{selectedCount === 1 ? "" : "s"} selected
            {selectedCount > 1 ? (
              <span className="ml-1 text-muted-foreground">
                ({format(selectedWorkdays[0], "MMM d")} – {format(selectedWorkdays[selectedCount - 1], "MMM d")})
              </span>
            ) : null}
          </span>
          <div className="flex items-center gap-1">
            <LeaveFormDialog
              trigger={
                <Button size="sm" className="glow-primary">
                  Log leave
                </Button>
              }
              defaultStart={format(selectedWorkdays[0], "yyyy-MM-dd")}
              defaultEnd={format(selectedWorkdays[selectedCount - 1], "yyyy-MM-dd")}
            />
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Tip: click a day, or drag across days to select a range.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {LEAVE_TYPES.map((type) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", LEAVE_TYPE_DOT_CLASS[type])} />
            {LEAVE_TYPE_LABELS[type]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-muted-foreground/40" />
          Weekend (Fri/Sat)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full ring-2 ring-primary" />
          Today
        </span>
      </div>
    </div>
  );
}
