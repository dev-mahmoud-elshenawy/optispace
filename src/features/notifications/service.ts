import type { Notification } from "@prisma/client";

export type NotificationType = "assigned" | "mentioned";

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
};

// The bold title of the notification — the project name (falls back to the app name).
export function notificationTitle(n: Pick<NotificationView, "project">): string {
  return n.project ?? "OptiSpace";
}

// The "who did what" line — "Ahmed Ali mentioned you" / "Assigned by Ahmed Ali",
// with generic fallbacks when the actor is unknown.
export function notificationActor(n: Pick<NotificationView, "type" | "actor">): string {
  if (n.type === "mentioned") return n.actor ? `${n.actor} mentioned you` : NOTIFICATION_LABELS.mentioned;
  return n.actor ? `Assigned by ${n.actor}` : NOTIFICATION_LABELS.assigned;
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
