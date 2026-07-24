import "server-only";

import { db } from "@/lib/db";

import { byDisplayTime, notSnoozed, toNotificationView, type NotificationView } from "./service";

export async function listNotifications(limit = 50): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: { deletedAt: null, ...notSnoozed() },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toNotificationView).sort(byDisplayTime);
}

export async function unreadNotificationCount(): Promise<number> {
  return db.notification.count({ where: { deletedAt: null, readAt: null, ...notSnoozed() } });
}

export async function recentNotifications(limit = 5): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: { deletedAt: null, readAt: null, ...notSnoozed() },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toNotificationView).sort(byDisplayTime);
}
