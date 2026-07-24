import { describe, expect, it } from "vitest";
import { dueDateNotificationEvents, taskDaySpan, type DueTaskInput } from "./service";

describe("taskDaySpan", () => {
  it("returns null when no task has a due date", () => {
    expect(taskDaySpan([{ dueDate: null }, { dueDate: null }])).toBeNull();
  });

  it("returns 1 for a single due date", () => {
    expect(taskDaySpan([{ dueDate: new Date(2026, 0, 10) }])).toBe(1);
  });

  it("spans the earliest to latest due date inclusively", () => {
    const tasks = [{ dueDate: new Date(2026, 0, 10) }, { dueDate: null }, { dueDate: new Date(2026, 0, 15) }];
    expect(taskDaySpan(tasks)).toBe(6);
  });
});

describe("dueDateNotificationEvents", () => {
  const task = (overrides: Partial<DueTaskInput> = {}): DueTaskInput => ({
    id: "t1",
    title: "Ship it",
    dueDate: new Date(),
    projectName: "OptiSpace",
    ...overrides,
  });

  it("flags a past-due task as overdue", () => {
    const now = new Date(2026, 0, 10);
    const events = dueDateNotificationEvents([task({ dueDate: new Date(2026, 0, 5) })], now);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("overdue");
  });

  it("flags today and tomorrow as due_soon with distinct messages", () => {
    const now = new Date(2026, 0, 10);
    const events = dueDateNotificationEvents(
      [task({ id: "today", dueDate: new Date(2026, 0, 10) }), task({ id: "tomorrow", dueDate: new Date(2026, 0, 11) })],
      now,
    );
    expect(events.map((e) => e.message)).toEqual(["Due today", "Due tomorrow"]);
  });

  it("emits nothing for a task due 2+ days out", () => {
    const now = new Date(2026, 0, 10);
    const events = dueDateNotificationEvents([task({ dueDate: new Date(2026, 0, 12) })], now);
    expect(events).toHaveLength(0);
  });

  it("builds a dedupeKey stable within the same calendar day (re-fire-safe)", () => {
    const now = new Date(2026, 0, 10, 9);
    const laterSameDay = new Date(2026, 0, 10, 17);
    const [a] = dueDateNotificationEvents([task({ dueDate: new Date(2026, 0, 5) })], now);
    const [b] = dueDateNotificationEvents([task({ dueDate: new Date(2026, 0, 5) })], laterSameDay);
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });

  // Gap: the file comments explicitly call out a timezone bug class (toISOString()
  // shifting the local calendar day near UTC midnight). Worth a regression test once
  // the test runner's timezone can be pinned (process.env.TZ or vitest environmentOptions).
  it.todo("keeps todayKey stable for a user east of UTC near local midnight");
});
