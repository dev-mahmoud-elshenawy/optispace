"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/actions";
import { notificationActor, notificationTitle, type NotificationView } from "@/features/notifications/service";
import { cn } from "@/lib/utils";

interface NotificationsListProps {
  notifications: NotificationView[];
}

export function NotificationsList({ notifications }: NotificationsListProps) {
  const router = useRouter();
  const [rows, setRows] = useState(notifications);
  const unreadCount = rows.filter((r) => !r.read).length;

  // Tell the sidebar bell to re-poll so its counter reflects reads/dismisses made here.
  function notifyBell() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("optispace:notifications-updated"));
  }

  async function handleOpen(row: NotificationView) {
    window.open(row.url, "_blank", "noreferrer");
    if (!row.read) {
      const result = await markNotificationRead(row.id);
      if (result.ok) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, read: true } : r)));
        notifyBell();
      } else {
        toast.error(result.error);
      }
    }
  }

  async function handleMarkAllRead() {
    const result = await markAllNotificationsRead();
    if (result.ok) {
      setRows((prev) => prev.map((r) => ({ ...r, read: true })));
      notifyBell();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleDismiss(id: string) {
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    const result = await dismissNotification(id);
    if (!result.ok) {
      toast.error(result.error);
      setRows(previous);
    } else {
      notifyBell();
      router.refresh();
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No notifications yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
        </p>
        {unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            Mark all read
          </Button>
        ) : null}
      </div>

      <div className="space-y-1">
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              "group flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5 transition-colors hover:bg-accent/40",
              !row.read && "bg-primary/5",
            )}
          >
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", row.read ? "bg-transparent" : "bg-primary")} />
            <button type="button" onClick={() => handleOpen(row)} className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-medium text-foreground">{notificationTitle(row)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(row.occurredAt ?? row.createdAt, { addSuffix: true })}
                </span>
              </div>
              <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
              <p className="text-xs text-muted-foreground">{notificationActor(row)}</p>
              {row.type === "mentioned" && row.message ? (
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 px-2 py-1 text-xs text-foreground/80">
                  {row.message}
                </p>
              ) : null}
            </button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => handleDismiss(row.id)}
            >
              <Trash2Icon />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
