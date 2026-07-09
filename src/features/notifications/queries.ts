import "server-only";

import { db } from "@/lib/db";

import { toNotificationView, type NotificationView } from "./service";

export async function listNotifications(limit = 50): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toNotificationView);
}

export async function unreadNotificationCount(): Promise<number> {
  return db.notification.count({ where: { deletedAt: null, readAt: null } });
}

export async function recentNotifications(limit = 5): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: { deletedAt: null, readAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toNotificationView);
}
