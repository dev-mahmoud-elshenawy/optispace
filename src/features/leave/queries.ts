import "server-only";
import { db } from "@/lib/db";
import { computeSummary, toLeaveView, type LeaveView } from "./service";

export interface AllowanceDetail {
  total: number; // base days set for the year
  carryOver: number; // days rolled in from the previous year
  effective: number; // total + carryOver
}

export async function getAllowanceDetail(year: number): Promise<AllowanceDetail> {
  const row = await db.leaveAllowance.findUnique({ where: { year } });
  const total = row?.totalDays ?? 0;
  const carryOver = row?.carryOverDays ?? 0;
  return { total, carryOver, effective: total + carryOver };
}

// Unused annual days at the end of a year — the amount worth carrying into the next.
export async function getYearRemaining(year: number): Promise<number> {
  const [{ effective }, leaves] = await Promise.all([getAllowanceDetail(year), listLeaves(year)]);
  return computeSummary(effective, leaves).remainingDays;
}

export async function listLeaves(year: number): Promise<LeaveView[]> {
  const rangeStart = new Date(Date.UTC(year, 0, 1));
  const rangeEnd = new Date(Date.UTC(year + 1, 0, 1));
  const rows = await db.leave.findMany({
    where: { startDate: { gte: rangeStart, lt: rangeEnd }, deletedAt: null },
    orderBy: { startDate: "desc" },
  });
  return rows.map(toLeaveView);
}

export async function getLeaveSummary(
  year: number,
): Promise<{ allowanceDays: number; usedDays: number; remainingDays: number }> {
  const [{ effective, carryOver }, leaves] = await Promise.all([getAllowanceDetail(year), listLeaves(year)]);
  const { allowanceDays, usedDays, remainingDays } = computeSummary(effective, leaves, carryOver);
  return { allowanceDays, usedDays, remainingDays };
}
