import { describe, expect, it } from "vitest";
import { byDisplayTime, notificationActor, notificationTitle, notSnoozed, type NotificationView } from "./service";

describe("notSnoozed", () => {
  it("matches never-snoozed or already-expired snoozes", () => {
    const where = notSnoozed(new Date(2026, 0, 10));
    expect(where.OR).toEqual([{ snoozedUntil: null }, { snoozedUntil: { lte: new Date(2026, 0, 10) } }]);
  });
});

describe("notificationTitle", () => {
  it("uses the project name when present", () => {
    expect(notificationTitle({ project: "OptiSpace API" })).toBe("OptiSpace API");
  });

  it("falls back to the app name with no project", () => {
    expect(notificationTitle({ project: null })).toBe("OptiSpace");
  });
});

describe("notificationActor", () => {
  it("names the mentioner when present", () => {
    expect(notificationActor({ type: "mentioned", actor: "Ahmed" })).toBe("Ahmed mentioned you");
  });

  it("falls back to the generic label with no actor", () => {
    expect(notificationActor({ type: "mentioned", actor: null })).toBe("Mentioned you");
  });

  it("never attributes an actor to due_soon/overdue (local deadlines, not someone's action)", () => {
    expect(notificationActor({ type: "due_soon", actor: "Ahmed" })).toBe("Due soon");
    expect(notificationActor({ type: "overdue", actor: "Ahmed" })).toBe("Overdue");
  });

  it("defaults unknown types to the assignment phrasing", () => {
    expect(notificationActor({ type: "assigned", actor: "Ahmed" })).toBe("Assigned by Ahmed");
  });
});

describe("byDisplayTime", () => {
  const view = (overrides: Partial<NotificationView>): NotificationView => ({
    id: "n1",
    type: "assigned",
    externalId: "1",
    title: "Task",
    url: "/tasks",
    message: null,
    project: null,
    actor: null,
    occurredAt: null,
    read: false,
    createdAt: new Date(2026, 0, 1),
    ...overrides,
  });

  it("sorts newest first by occurredAt", () => {
    const older = view({ occurredAt: new Date(2026, 0, 1) });
    const newer = view({ occurredAt: new Date(2026, 0, 5) });
    expect([older, newer].sort(byDisplayTime)).toEqual([newer, older]);
  });

  it("falls back to createdAt when occurredAt is null", () => {
    const older = view({ occurredAt: null, createdAt: new Date(2026, 0, 1) });
    const newer = view({ occurredAt: null, createdAt: new Date(2026, 0, 5) });
    expect([older, newer].sort(byDisplayTime)).toEqual([newer, older]);
  });
});
