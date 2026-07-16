import type { Notification } from "@prisma/client";

export type NotificationType =
  | "assigned"
  | "mentioned"
  | "due_soon"
  | "overdue"
  | "status_changed"
  | "pr_review_requested"
  | "pr_status_changed"
  | "meeting_soon";

export interface NotificationView {
  id: string;
  type: NotificationType;
  externalId: string;
  title: string; // work item title
  url: string;
  message: string | null;
  project: string | null; // ADO project name
  actor: string | null; // who mentioned / assigned me
  occurredAt: Date | null; // when it happened in ADO (falls back to createdAt in UI)
  read: boolean;
  createdAt: Date;
}

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  assigned: "Assigned to you",
  mentioned: "Mentioned you",
  due_soon: "Due soon",
  overdue: "Overdue",
  status_changed: "Status changed",
  pr_review_requested: "Review requested",
  pr_status_changed: "PR updated",
  meeting_soon: "Meeting starting soon",
};

// The bold title of the notification — the project name (falls back to the app name).
export function notificationTitle(n: Pick<NotificationView, "project">): string {
  return n.project ?? "OptiSpace";
}

// The "who did what" line — "Ahmed Ali mentioned you" / "Assigned by Ahmed Ali",
// with generic fallbacks when the actor is unknown. due_soon/overdue have no actor
// (they're a local deadline, not something someone else did).
export function notificationActor(n: Pick<NotificationView, "type" | "actor">): string {
  if (n.type === "mentioned") return n.actor ? `${n.actor} mentioned you` : NOTIFICATION_LABELS.mentioned;
  if (n.type === "due_soon" || n.type === "overdue") return NOTIFICATION_LABELS[n.type];
  if (n.type === "status_changed") return n.actor ? `${n.actor} changed the status` : NOTIFICATION_LABELS.status_changed;
  if (n.type === "pr_review_requested") return n.actor ? `${n.actor} requested your review` : NOTIFICATION_LABELS.pr_review_requested;
  if (n.type === "pr_status_changed") return NOTIFICATION_LABELS.pr_status_changed;
  if (n.type === "meeting_soon") return NOTIFICATION_LABELS.meeting_soon;
  return n.actor ? `Assigned by ${n.actor}` : NOTIFICATION_LABELS.assigned;
}

// Sort by the time we actually DISPLAY (occurredAt, falling back to createdAt),
// newest first. Ordering by createdAt (detection time) instead put freshly-synced
// but old items — e.g. a PR review requested 3 months ago — above genuinely recent
// notifications, so the shown dates looked out of order.
export function byDisplayTime(a: NotificationView, b: NotificationView): number {
  return (b.occurredAt ?? b.createdAt).getTime() - (a.occurredAt ?? a.createdAt).getTime();
}

export function toNotificationView(row: Notification): NotificationView {
  return {
    id: row.id,
    type: row.type as NotificationType,
    externalId: row.externalId,
    title: row.title,
    url: row.url,
    message: row.message,
    project: row.project,
    actor: row.actor,
    occurredAt: row.occurredAt,
    read: row.readAt != null,
    createdAt: row.createdAt,
  };
}

// The event shape the sync produces; recordNotifications() persists these.
export interface NotificationEvent {
  type: NotificationType;
  externalId: string;
  title: string;
  url: string;
  message: string;
  project: string | null;
  actor: string | null;
  occurredAt: string | null; // ISO time it happened in ADO
  dedupeKey: string;
}
