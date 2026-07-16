"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";

import { byDisplayTime, toNotificationView, type NotificationEvent, type NotificationView } from "./service";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Called by the ADO sync. Dedups by dedupeKey (existence check, since SQLite has
// no createMany skipDuplicates) and returns how many rows were newly created — the
// sync uses that to decide whether to refresh the UI / fire desktop push.
export async function recordNotifications(events: NotificationEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const keys = events.map((e) => e.dedupeKey);
  const existing = await db.notification.findMany({
    where: { dedupeKey: { in: keys } },
    select: { dedupeKey: true },
  });
  const seen = new Set(existing.map((e) => e.dedupeKey));
  const fresh = events.filter((e) => !seen.has(e.dedupeKey));
  for (const e of fresh) {
    await db.notification.create({
      data: {
        type: e.type,
        externalId: e.externalId,
        title: e.title,
        url: e.url,
        message: e.message,
        project: e.project,
        actor: e.actor,
        occurredAt: e.occurredAt ? new Date(e.occurredAt) : null,
        dedupeKey: e.dedupeKey,
      },
    });
  }
  return fresh.length;
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  revalidatePath("/");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  await db.notification.updateMany({
    where: { deletedAt: null, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/");
  return { ok: true };
}

export async function dismissNotification(id: string): Promise<ActionResult> {
  await db.notification.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/notifications");
  revalidatePath("/");
  return { ok: true };
}

// Client feed for the bell + desktop push. Returns unread count, recent list, and the
// rows whose desktop popup hasn't fired yet (then marks them notified in the same call).
export interface NotificationFeed {
  unread: number;
  recent: NotificationView[];
  toPush: NotificationView[];
}

export async function pollNotificationFeed(): Promise<NotificationFeed> {
  const [unread, recentRows, pushRows] = await Promise.all([
    db.notification.count({ where: { deletedAt: null, readAt: null } }),
    db.notification.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.notification.findMany({ where: { deletedAt: null, notifiedAt: null, readAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  // Do NOT mark notified here — the client marks only after the browser popup
  // actually fires (and only when permission is granted), so a poll before the
  // user grants permission doesn't silently consume the push.
  return {
    unread,
    recent: recentRows.map(toNotificationView).sort(byDisplayTime),
    toPush: pushRows.map(toNotificationView),
  };
}

// Client calls this after the desktop popup for these rows has fired.
export async function markNotificationsNotified(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.notification.updateMany({
    where: { id: { in: ids } },
    data: { notifiedAt: new Date() },
  });
}
