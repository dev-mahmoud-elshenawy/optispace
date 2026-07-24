"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { BellRing, ClockIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
  pollNotificationFeed,
  snoozeNotification,
} from "@/features/notifications/actions";
import {
  NOTIFICATION_LABELS,
  notificationActor,
  notificationTitle,
  type NotificationType,
  type NotificationView,
} from "@/features/notifications/service";
import { getPushPrefs, isPushEnabled, setPushPref, type PushPrefs } from "@/features/notifications/push-prefs";
import { AzureDevOpsTaskDetail } from "@/features/integrations/azure-devops/task-detail";
import { GithubPrDetail } from "@/features/integrations/github/pr-detail";
import { cn } from "@/lib/utils";

// Snooze presets → the Date the notification should resurface.
const SNOOZE_OPTIONS: { label: string; until: () => Date }[] = [
  { label: "1 hour", until: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: "4 hours", until: () => new Date(Date.now() + 4 * 60 * 60 * 1000) },
  {
    label: "Tomorrow",
    until: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

const PAGE_SIZE = 20; // rows shown per page; "Load more" reveals another PAGE_SIZE

interface NotificationsListProps {
  notifications: NotificationView[];
}

export function NotificationsList({ notifications }: NotificationsListProps) {
  const router = useRouter();
  const [rows, setRows] = useState(notifications);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [prTarget, setPrTarget] = useState<{ repo: string; number: number } | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");
  const [pushPrefs, setPushPrefs] = useState<PushPrefs>({});
  const [pushSupported, setPushSupported] = useState(false);
  const unreadCount = rows.filter((r) => !r.read).length;

  // localStorage is client-only — load prefs after mount (and note whether the browser
  // even supports desktop notifications, to decide whether to show the prefs menu).
  useEffect(() => {
    setPushSupported(typeof window !== "undefined" && "Notification" in window);
    setPushPrefs(getPushPrefs());
  }, []);

  function togglePush(type: NotificationType, enabled: boolean) {
    setPushPrefs(setPushPref(type, enabled));
  }
  // Only offer type options that actually appear in the current rows.
  const presentTypes = Array.from(new Set(rows.map((r) => r.type)));
  const filtered = typeFilter === "all" ? rows : rows.filter((r) => r.type === typeFilter);
  const shown = filtered.slice(0, visible);

  // Live-prepend new notifications while this page is open — the poller fires
  // "optispace:notifications-updated" when fresh rows land; pull the recent feed
  // and prepend any we haven't seen. No page refresh (initial state is frozen).
  useEffect(() => {
    if (typeof window === "undefined") return;
    async function pull() {
      try {
        const feed = await pollNotificationFeed();
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const incoming = feed.recent.filter((r) => !seen.has(r.id));
          return incoming.length > 0 ? [...incoming, ...prev] : prev;
        });
      } catch {
        // transient poll failure — next event retries
      }
    }
    window.addEventListener("optispace:notifications-updated", pull);
    return () => window.removeEventListener("optispace:notifications-updated", pull);
  }, []);

  // Tell the sidebar bell to re-poll so its counter reflects reads/dismisses made here.
  function notifyBell() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("optispace:notifications-updated"));
  }

  async function handleOpen(row: NotificationView) {
    // due_soon/overdue rows aren't ADO work items — externalId is the local task's
    // id, so route there instead of opening the ADO detail modal with a bogus id.
    if (row.type === "due_soon" || row.type === "overdue") {
      router.push(row.url);
    } else if (row.type === "pr_review_requested" || row.type === "pr_status_changed") {
      // Open the PR in the in-app modal — externalId is "owner/repo#number".
      const hash = row.externalId.lastIndexOf("#");
      const repo = row.externalId.slice(0, hash);
      const number = Number(row.externalId.slice(hash + 1));
      if (repo && Number.isFinite(number)) setPrTarget({ repo, number });
      else window.open(row.url, "_blank", "noreferrer");
    } else if (row.type === "meeting_soon") {
      // Calendar reminder — url is the meeting join link (open it) or "/calendar".
      if (/^https?:\/\//.test(row.url)) window.open(row.url, "_blank", "noreferrer");
      else router.push(row.url);
    } else {
      setDetailId(row.externalId); // open the in-app ADO editor (live fetch by work item id)
    }
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
    // Optimistic: clear unread instantly (count + blue dots), roll back only on error.
    // Awaiting the server first made the UI look frozen after the click.
    const previous = rows;
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
    notifyBell();
    const result = await markAllNotificationsRead();
    if (result.ok) {
      router.refresh();
    } else {
      setRows(previous);
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

  async function handleSnooze(id: string, until: Date) {
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.id !== id)); // vanishes until it resurfaces
    const result = await snoozeNotification(id, until.toISOString());
    if (!result.ok) {
      toast.error(result.error);
      setRows(previous);
    } else {
      toast.success(`Snoozed until ${until.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: true })}`);
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

  // Bucket by the displayed date (occurredAt falls back to createdAt). Rows are
  // already newest-first, so each bucket keeps that order.
  const buckets: { label: string; rows: NotificationView[] }[] = [
    { label: "Today", rows: [] },
    { label: "Yesterday", rows: [] },
    { label: "Older", rows: [] },
  ];
  for (const row of shown) {
    const when = row.occurredAt ?? row.createdAt;
    const bucket = isToday(when) ? buckets[0] : isYesterday(when) ? buckets[1] : buckets[2];
    bucket.rows.push(row);
  }

  function renderRow(row: NotificationView) {
    return (
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
          {(row.type === "mentioned" || row.type === "status_changed") && row.message ? (
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 px-2 py-1 text-xs text-foreground/80">
              {row.message}
            </p>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <ClockIcon />
                <span className="sr-only">Snooze</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Snooze until…</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SNOOZE_OPTIONS.map((o) => (
                <DropdownMenuItem key={o.label} onClick={() => handleSnooze(row.id, o.until())}>
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon-xs" onClick={() => handleDismiss(row.id)}>
            <Trash2Icon />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
        </p>
        <div className="flex items-center gap-2">
          {pushSupported ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <BellRing className="size-4" />
                  Alerts
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Desktop push by type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(NOTIFICATION_LABELS) as NotificationType[]).map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={isPushEnabled(pushPrefs, t)}
                    onCheckedChange={(v) => togglePush(t, v)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {NOTIFICATION_LABELS[t]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {presentTypes.length > 1 ? (
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as NotificationType | "all")}>
              <SelectTrigger size="sm" className="w-44">
                <SelectValue>{typeFilter === "all" ? "All types" : NOTIFICATION_LABELS[typeFilter]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {presentTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {NOTIFICATION_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No {typeFilter === "all" ? "" : `${NOTIFICATION_LABELS[typeFilter].toLowerCase()} `}notifications.
        </p>
      ) : null}

      {buckets
        .filter((b) => b.rows.length > 0)
        .map((b) => (
          <div key={b.label} className="space-y-1">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{b.label}</p>
            {b.rows.map(renderRow)}
          </div>
        ))}

      {filtered.length > visible ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Load more ({filtered.length - visible})
          </Button>
        </div>
      ) : null}
    </div>
    <AzureDevOpsTaskDetail
      externalId={detailId ?? ""}
      open={detailId !== null}
      onOpenChange={(o) => {
        if (!o) setDetailId(null);
      }}
    />
    {prTarget ? (
      <GithubPrDetail
        nodeId={null}
        repo={prTarget.repo}
        number={prTarget.number}
        title={`#${prTarget.number}`}
        open={prTarget !== null}
        onOpenChange={(o) => {
          if (!o) setPrTarget(null);
        }}
      />
    ) : null}
    </>
  );
}
