"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LEAVE_TYPES } from "@/types";
import type { LeaveView } from "../service";
import { LEAVE_TYPE_CELL_CLASS, LEAVE_TYPE_DOT_CLASS, LEAVE_TYPE_LABELS } from "./leave-type-style";

interface LeaveCalendarProps {
  leaves: LeaveView[];
  initialMonth: Date;
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function LeaveCalendar({ leaves, initialMonth }: LeaveCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(initialMonth));

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month));
    const gridEnd = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  function leaveForDay(day: Date): LeaveView | undefined {
    return leaves.find((leave) => isWithinInterval(day, { start: leave.startDate, end: leave.endDate }));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => subMonths(m, 1))}>
          <ChevronLeftIcon />
          <span className="sr-only">Previous month</span>
        </Button>
        <p className="text-sm font-medium">{format(month, "MMMM yyyy")}</p>
        <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRightIcon />
          <span className="sr-only">Next month</span>
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const leave = leaveForDay(day);
          return (
            <div
              key={day.toISOString()}
              title={leave ? `${LEAVE_TYPE_LABELS[leave.type]} leave` : undefined}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md text-xs",
                !isSameMonth(day, month) && "text-muted-foreground/40",
                leave ? LEAVE_TYPE_CELL_CLASS[leave.type] : "hover:bg-muted",
              )}
            >
              {format(day, "d")}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {LEAVE_TYPES.map((type) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", LEAVE_TYPE_DOT_CLASS[type])} />
            {LEAVE_TYPE_LABELS[type]}
          </span>
        ))}
      </div>
    </div>
  );
}
