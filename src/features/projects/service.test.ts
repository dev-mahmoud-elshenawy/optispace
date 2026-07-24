import { describe, expect, it } from "vitest";
import { compareProjectsForOrder, computeProgressPct, projectHealth, type ProjectSortKey } from "./service";
import type { MilestoneView } from "./service";

describe("computeProgressPct", () => {
  it("rounds done/total to a percentage", () => {
    expect(computeProgressPct(1, 3)).toBe(33);
  });

  it("returns 0 when total is 0 (avoids NaN)", () => {
    expect(computeProgressPct(0, 0)).toBe(0);
  });

  it("returns 100 when done equals total", () => {
    expect(computeProgressPct(5, 5)).toBe(100);
  });
});

describe("compareProjectsForOrder", () => {
  const key = (overrides: Partial<ProjectSortKey> = {}): ProjectSortKey => ({
    status: "active",
    pinned: false,
    sortWeight: 0,
    name: "A",
    ...overrides,
  });

  it("puts pinned projects first regardless of status", () => {
    const pinned = key({ pinned: true, status: "completed" });
    const unpinned = key({ pinned: false, status: "active" });
    expect(compareProjectsForOrder(pinned, unpinned)).toBeLessThan(0);
  });

  it("orders by status band when pin state is equal", () => {
    expect(compareProjectsForOrder(key({ status: "active" }), key({ status: "paused" }))).toBeLessThan(0);
  });

  it("falls back to sortWeight within the same status band", () => {
    expect(compareProjectsForOrder(key({ sortWeight: 0 }), key({ sortWeight: 1 }))).toBeLessThan(0);
  });

  it("falls back to name A→Z as the final tiebreaker", () => {
    expect(compareProjectsForOrder(key({ name: "Alpha" }), key({ name: "Beta" }))).toBeLessThan(0);
  });

  it("treats fully-equal keys as equal", () => {
    expect(compareProjectsForOrder(key(), key())).toBe(0);
  });
});

describe("projectHealth", () => {
  const milestone = (overrides: Partial<MilestoneView> = {}): MilestoneView => ({
    id: "m1",
    title: "Beta launch",
    done: false,
    dueDate: null,
    order: 0,
    ...overrides,
  });

  it("returns null when there are no dated, undone milestones", () => {
    expect(projectHealth({ milestones: [milestone({ done: true, dueDate: new Date(2020, 0, 1) })] }, new Date())).toBeNull();
  });

  it("flags overdue when a milestone's due date has passed", () => {
    const now = new Date(2026, 0, 10);
    const health = projectHealth({ milestones: [milestone({ dueDate: new Date(2026, 0, 5) })] }, now);
    expect(health).toEqual({ level: "overdue", count: 1 });
  });

  it("flags due_soon within the 3-day window", () => {
    const now = new Date(2026, 0, 10);
    const health = projectHealth({ milestones: [milestone({ dueDate: new Date(2026, 0, 12) })] }, now);
    expect(health).toEqual({ level: "due_soon", count: 1 });
  });

  it("does not flag due_soon just outside the 3-day window", () => {
    const now = new Date(2026, 0, 10);
    const health = projectHealth({ milestones: [milestone({ dueDate: new Date(2026, 0, 14) })] }, now);
    expect(health).toBeNull();
  });

  it("prefers overdue over due_soon when both are present", () => {
    const now = new Date(2026, 0, 10);
    const health = projectHealth(
      { milestones: [milestone({ dueDate: new Date(2026, 0, 5) }), milestone({ id: "m2", dueDate: new Date(2026, 0, 11) })] },
      now,
    );
    expect(health?.level).toBe("overdue");
  });
});
