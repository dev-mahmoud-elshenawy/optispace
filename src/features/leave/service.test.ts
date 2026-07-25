import { describe, expect, it } from "vitest";
import { computeSummary, leaveDays, type LeaveView } from "./service";

describe("leaveDays", () => {
  it("counts a single day inclusively", () => {
    const d = new Date(2026, 0, 15);
    expect(leaveDays(d, d)).toBe(1);
  });

  it("counts an inclusive range across months", () => {
    expect(leaveDays(new Date(2026, 0, 30), new Date(2026, 1, 2))).toBe(4);
  });

  it("ignores time-of-day (calendar days only)", () => {
    const start = new Date(2026, 0, 1, 23, 59);
    const end = new Date(2026, 0, 3, 0, 1);
    expect(leaveDays(start, end)).toBe(3);
  });

  // Gap: no coverage for end < start (would return a negative count) — decide the
  // intended behavior (clamp to 0? throw?) and lock it in with a test.
  it.todo("handles end date before start date");
});

describe("computeSummary", () => {
  const leave = (type: LeaveView["type"], days: number): LeaveView => ({
    id: "x",
    startDate: new Date(),
    endDate: new Date(),
    type,
    halfDay: false,
    notes: null,
    days,
  });

  it("sums used days and remaining against the allowance", () => {
    const summary = computeSummary(20, [leave("annual", 3), leave("annual", 2)]);
    expect(summary.usedDays).toBe(5);
    expect(summary.remainingDays).toBe(15);
    expect(summary.byType.annual).toBe(5);
  });

  it("allows remainingDays to go negative when over-allowance", () => {
    const summary = computeSummary(2, [leave("annual", 5)]);
    expect(summary.remainingDays).toBe(-3);
  });

  it("returns zeroed byType buckets with no leaves", () => {
    const summary = computeSummary(10, []);
    expect(summary.usedDays).toBe(0);
    expect(summary.byType.annual).toBe(0);
  });

  it("only annual leave draws down the allowance (sick/unpaid do not)", () => {
    const summary = computeSummary(20, [leave("annual", 3), leave("sick", 2), leave("unpaid", 5)]);
    expect(summary.usedDays).toBe(10);
    expect(summary.remainingDays).toBe(17); // 20 - 3 annual, unaffected by sick/unpaid
  });

  it("reports carried-over days", () => {
    const summary = computeSummary(25, [], 5);
    expect(summary.carriedOver).toBe(5);
  });
});
