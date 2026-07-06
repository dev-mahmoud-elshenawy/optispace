import "server-only";
import { db } from "@/lib/db";
import { computeSummary, toLeaveView, type LeaveView } from "./service";

export async function getAllowance(year: number): Promise<number> {
  const row = await db.leaveAllowance.findUnique({ where: { year } });
  return row?.totalDays ?? 0;
}

export async function listLeaves(year: number): Promise<LeaveView[]> {
  const rangeStart = new Date(Date.UTC(year, 0, 1));
  const rangeEnd = new Date(Date.UTC(year + 1, 0, 1));
  const rows = await db.leave.findMany({
    where: { startDate: { gte: rangeStart, lt: rangeEnd } },
    orderBy: { startDate: "desc" },
  });
  return rows.map(toLeaveView);
}

export async function getLeaveSummary(
  year: number,
): Promise<{ allowanceDays: number; usedDays: number; remainingDays: number }> {
  const [allowanceDays, leaves] = await Promise.all([getAllowance(year), listLeaves(year)]);
  const { allowanceDays: allowance, usedDays, remainingDays } = computeSummary(allowanceDays, leaves);
  return { allowanceDays: allowance, usedDays, remainingDays };
}
