"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";

import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsNotified,
  pollNotificationFeed,
  type NotificationFeed,
} from "@/features/notifications/actions";
import { notificationActor, notificationTitle, type NotificationView } from "@/features/notifications/service";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const POLL_MS = 60 * 1000;

// Bell + unread badge + dropdown; also owns the desktop-push side effect. Mounted
// once in the sidebar so it polls app-wide while the tab is open (local-first
// "real time" = noticed within the poll interval while the dev server is running).
export function NotificationBell() {
  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed>({ unread: 0, recent: [], toPush: [] });
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const lastUnread = useRef(0);
  const pollRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
  }, []);

  // Browsers reliably prompt only from a user gesture — requesting on mount is
  // silently ignored, which is why the banner never appeared. Request on click.
  async function enableDesktopAlerts() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
      if (result === "granted") pollRef.current(); // fire any pending pushes now
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      let result: NotificationFeed;
      try {
        result = await pollNotificationFeed();
      } catch {
        // ponytail: silent background poll — a transient "Failed to fetch" (dev
        // server restart / HMR race / offline) shouldn't crash the app; retry next tick.
        return;
      }
      if (cancelled) return;

      // Fire desktop popups only when permission is granted, then mark exactly
      // those rows notified — so nothing is silently consumed before the user
      // has allowed notifications.
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const fired = result.toPush.filter((row) => pushDesktopNotification(row)).map((row) => row.id);
        if (fired.length > 0) {
          await markNotificationsNotified(fired).catch(() => {});
        }
      }

      if (result.unread !== lastUnread.current) {
        lastUnread.current = result.unread;
        router.refresh();
      }
      setFeed(result);
    }

    pollRef.current = poll;
    poll();
    const id = setInterval(poll, POLL_MS);
    // Re-poll the instant a sync reports new notifications (fired by AzureDevOpsAutoSync).
    const onUpdate = () => poll();
    window.addEventListener("optispace:notifications-updated", onUpdate);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("optispace:notifications-updated", onUpdate);
    };
  }, [router]);

  async function handleOpenRow(row: NotificationView) {
    if (!row.read) {
      await markNotificationRead(row.id);
      setFeed((prev) => ({
        ...prev,
        unread: Math.max(0, prev.unread - 1),
        recent: prev.recent.map((r) => (r.id === row.id ? { ...r, read: true } : r)),
      }));
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setFeed((prev) => ({ ...prev, unread: 0, recent: prev.recent.map((r) => ({ ...r, read: true })) }));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {feed.unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {feed.unread > 99 ? "99+" : feed.unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">Notifications</span>
          {feed.unread > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {perm === "default" ? (
          <button
            type="button"
            onClick={enableDesktopAlerts}
            className="mb-1 flex w-full items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-primary/15"
          >
            <Bell className="h-3.5 w-3.5" />
            Enable desktop alerts
          </button>
        ) : perm === "denied" ? (
          <p className="mb-1 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            Desktop alerts are blocked — enable notifications for this site in your browser settings.
          </p>
        ) : null}
        {feed.recent.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          feed.recent.map((row) => (
            <DropdownMenuItem key={row.id} asChild className="cursor-pointer p-0">
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => handleOpenRow(row)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left",
                  !row.read && "bg-primary/5",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {!row.read ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                    <span className="truncate text-xs font-semibold text-muted-foreground">{notificationTitle(row)}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(row.occurredAt ?? row.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <span className="line-clamp-1 w-full text-sm font-medium text-foreground">{row.title}</span>
                <span className="w-full truncate text-xs text-muted-foreground">{notificationActor(row)}</span>
              </a>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer justify-center text-xs">
          <Link href="/notifications">View all</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function pushDesktopNotification(row: NotificationView): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    // Title is the one line we control (the browser appends the site origin as a
    // subtitle — only a PWA install replaces that). Brand it "OptiSpace".
    // Title = project name; body = work item title + who did it. (The browser
    // still injects the site origin as a subtitle between them — not controllable.)
    const n = new Notification(notificationTitle(row), {
      body: `${row.title}\n${notificationActor(row)}`,
      tag: row.id,
    });
    n.onclick = () => {
      window.focus();
      window.open(row.url, "_blank");
    };
    return true;
  } catch {
    // Permission edge cases / unsupported environments — in-app bell still works.
    return false;
  }
}
