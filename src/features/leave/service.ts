import type { Leave } from "@prisma/client";
import { LEAVE_TYPES, type LeaveType } from "@/types";

export interface LeaveView {
  id: string;
  startDate: Date;
  endDate: Date;
  type: LeaveType;
  halfDay: boolean;
  notes: string | null;
  days: number;
}

export interface LeaveSummary {
  allowanceDays: number; // effective = base + carried
  carriedOver: number; // portion of allowanceDays rolled in from the previous year
  usedDays: number;
  remainingDays: number;
  byType: Record<LeaveType, number>;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Inclusive calendar-day count (weekends included — see spec's ponytail note in the calling code).
export function leaveDays(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / MS_PER_DAY) + 1;
}

export function toLeaveView(row: Leave): LeaveView {
  const type = row.type as LeaveType;
  // A half day counts 0.5 (only offered for single-day leave in the form).
  const days = row.halfDay ? 0.5 : leaveDays(row.startDate, row.endDate);
  return {
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    type,
    halfDay: row.halfDay,
    notes: row.notes,
    days,
  };
}

export function computeSummary(allowanceDays: number, leaves: LeaveView[], carriedOver = 0): LeaveSummary {
  const byType = LEAVE_TYPES.reduce(
    (acc, type) => {
      acc[type] = 0;
      return acc;
    },
    {} as Record<LeaveType, number>,
  );

  let usedDays = 0;
  for (const leave of leaves) {
    usedDays += leave.days;
    byType[leave.type] += leave.days;
  }

  // The allowance is annual PAID leave — sick/unpaid don't draw it down.
  return {
    allowanceDays,
    carriedOver,
    usedDays,
    remainingDays: allowanceDays - byType.annual,
    byType,
  };
}
