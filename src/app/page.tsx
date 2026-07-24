import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ListChecks, GitBranch, GitPullRequest, Package as PackageIcon, ExternalLink, ArrowUpRight, Activity, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ComponentType, ReactNode } from "react";
import { listProfiles } from "@/features/profiles/queries";
import { getLeaveSummary, listLeaves } from "@/features/leave/queries";
import { getTaskStatusCounts, listTasks } from "@/features/tasks/queries";
import { listProjects } from "@/features/projects/queries";
import { countPackages } from "@/features/packages/queries";
import { recentNotifications, unreadNotificationCount } from "@/features/notifications/queries";
import { notificationActor, notificationTitle, type NotificationView } from "@/features/notifications/service";
import { todayCalendarEvents } from "@/features/calendar/queries";
import { listPullRequests } from "@/features/integrations/github/queries";
import { DayPreviewCard } from "@/components/dashboard/day-preview-card";
import { DashboardCharts } from "@/features/dashboard/components/dashboard-charts";

export default async function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const startToday = new Date(year, now.getMonth(), now.getDate());
  const endToday = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startTomorrow = new Date(year, now.getMonth(), now.getDate() + 1);
  const endTomorrow = new Date(year, now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
  const startWeek = new Date(year, now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  const endWeek = new Date(startWeek.getTime() + 7 * 86_400_000 - 1);
  const [profiles, leave, taskCounts, projects, packageCount, leaves, tasks, notifications, unreadCount, todayEvents, tomorrowEvents, pullRequests, weekEvents] = await Promise.all([
    listProfiles(),
    getLeaveSummary(year),
    getTaskStatusCounts(),
    listProjects(),
    countPackages(),
    listLeaves(year),
    listTasks(),
    recentNotifications(),
    unreadNotificationCount(),
    todayCalendarEvents(startToday, endToday),
    todayCalendarEvents(startTomorrow, endTomorrow),
    listPullRequests(),
    todayCalendarEvents(startWeek, endWeek),
  ]);
  const topPullRequests = pullRequests.slice(0, 5);
  const weekTasksDone = tasks.filter((t) => t.status === "done" && t.updatedAt >= startWeek).length;
  // Approx: counts a leave's full length if it overlaps the week at all (ponytail: good enough for a digest).
  const weekLeaveDays = leaves
    .filter((l) => l.startDate <= endWeek && l.endDate >= startWeek)
    .reduce((n, l) => n + l.days, 0);
  // "Today's focus" — the day's urgent items, surfaced in one strip at the top.
  const upcomingMeetings = todayEvents.filter((e) => new Date(e.end) >= now);
  const prsToReview = pullRequests.filter(
    (p) => !p.draft && (p.reviewDecision === "REVIEW_REQUIRED" || p.reviewDecision == null),
  ).length;

  const openTasks = taskCounts.todo + taskCounts.in_progress;
  const activeProjects = projects.filter((p) => p.status === "active");

  const dueTodayOrOverdue = tasks
    .filter((t) => t.status !== "done" && t.dueDate !== null && t.dueDate <= endToday)
    .sort((a, b) => (a.dueDate as Date).getTime() - (b.dueDate as Date).getTime());
  const onLeaveToday = leaves.filter((l) => l.startDate <= endToday && l.endDate >= startToday);

  const dueTomorrow = tasks
    .filter((t) => t.status !== "done" && t.dueDate !== null && t.dueDate >= startTomorrow && t.dueDate <= endTomorrow)
    .sort((a, b) => (a.dueDate as Date).getTime() - (b.dueDate as Date).getTime());
  const onLeaveTomorrow = leaves.filter((l) => l.startDate <= endTomorrow && l.endDate >= startTomorrow);

  const todayData = {
    events: todayEvents,
    tasks: dueTodayOrOverdue.map((t) => {
      const overdue = (t.dueDate as Date) < startToday;
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        overdue,
        badge: overdue ? `Overdue · ${format(t.dueDate as Date, "MMM d")}` : "Due today",
      };
    }),
    onLeave: onLeaveToday.map((l) => ({ id: l.id, until: l.endDate.toISOString() })),
  };
  const tomorrowData = {
    events: tomorrowEvents,
    tasks: dueTomorrow.map((t) => ({ id: t.id, title: t.title, status: t.status, overdue: false, badge: "Due tomorrow" })),
    onLeave: onLeaveTomorrow.map((l) => ({ id: l.id, until: l.endDate.toISOString() })),
  };

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const leaveByMonth = MONTHS.map((month, i) => ({
    month,
    days: leaves.filter((l) => l.startDate.getMonth() === i).reduce((n, l) => n + l.days, 0),
  }));
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = format(now, "EEEE, MMMM d");
  const enter = "animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both";

  const focusCount = upcomingMeetings.length + dueTodayOrOverdue.length + prsToReview + unreadCount;

  const prIndexOffset = topPullRequests.length > 0 ? 1 : 0;

  return (
    <div className="min-h-full pb-16">
      {/* ─── Hero: cinematic greeting on a blue→cyan glow mesh ─── */}
      <section className="relative isolate overflow-hidden border-b border-border/60">
        <div aria-hidden className="pointer-events-none absolute inset-0 hero-mesh" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-48 size-[28rem] rounded-full bg-primary/20 blur-[130px]" />
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 size-96 rounded-full bg-chart-2/10 blur-[130px]" />
        <div className="relative mx-auto max-w-6xl px-6 pb-12 pt-16">
          <div className="flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.35em] text-primary animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
            <span className="inline-block size-1.5 rounded-full bg-chart-2 shadow-[0_0_10px_var(--chart-2)] animate-pulse-dot" />
            {dateLabel}
          </div>
          <h1
            className="mt-4 font-heading text-5xl font-bold leading-[1.03] tracking-tight sm:text-6xl animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-both"
            style={{ animationDelay: "40ms" }}
          >
            <span className="text-gradient">{greeting}</span>
          </h1>
          <p
            className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-both"
            style={{ animationDelay: "120ms" }}
          >
            {focusCount > 0
              ? `${focusCount} thing${focusCount === 1 ? "" : "s"} need your attention today.`
              : "You're all clear for today — nothing on fire. Enjoy the calm."}
          </p>

          <div
            className="mt-8 flex flex-wrap gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both"
            style={{ animationDelay: "200ms" }}
          >
            {focusCount > 0 ? (
              <>
                {upcomingMeetings.length > 0 ? (
                  <FocusChip
                    href="/calendar"
                    icon={CalendarDays}
                    tone="bg-sky-500/15 text-sky-500 ring-sky-500/25"
                    label={`${upcomingMeetings.length} meeting${upcomingMeetings.length === 1 ? "" : "s"}`}
                    sub={upcomingMeetings[0] ? `Next: ${upcomingMeetings[0].title}` : undefined}
                  />
                ) : null}
                {dueTodayOrOverdue.length > 0 ? (
                  <FocusChip
                    href="/tasks"
                    icon={ListChecks}
                    tone="bg-amber-500/15 text-amber-500 ring-amber-500/25"
                    label={`${dueTodayOrOverdue.length} task${dueTodayOrOverdue.length === 1 ? "" : "s"} due`}
                    sub="Due today or overdue"
                  />
                ) : null}
                {prsToReview > 0 ? (
                  <FocusChip
                    href="/pull-requests"
                    icon={GitPullRequest}
                    tone="bg-indigo-500/15 text-indigo-400 ring-indigo-500/25"
                    label={`${prsToReview} PR${prsToReview === 1 ? "" : "s"} to review`}
                    sub="Awaiting your review"
                  />
                ) : null}
                {unreadCount > 0 ? (
                  <FocusChip
                    href="/notifications"
                    icon={Bell}
                    tone="bg-rose-500/15 text-rose-400 ring-rose-500/25"
                    label={`${unreadCount} unread`}
                    sub="Notifications"
                  />
                ) : null}
              </>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm font-medium text-emerald-500">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse-dot" /> All clear — nothing needs you 🎉
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-6 pt-10">
        {/* ─── 01 Overview ─── */}
        <section className="space-y-5">
          <SectionLabel index="01" title="Overview" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard href="/leave" icon={<CalendarDays className="size-5" />} label="Remaining leave" value={`${leave.remainingDays}`} sub={`of ${leave.allowanceDays} days`} delay={0} />
            <StatCard href="/tasks" icon={<ListChecks className="size-5" />} label="Open tasks" value={`${openTasks}`} sub={`${taskCounts.done} done`} delay={70} />
            <StatCard href="/projects" icon={<GitBranch className="size-5" />} label="Active projects" value={`${activeProjects.length}`} sub={`${projects.length} total`} delay={140} />
            <StatCard href="/packages" icon={<PackageIcon className="size-5" />} label="Packages" value={`${packageCount}`} sub="published" delay={210} />
          </div>

          <div className={`space-y-2 ${enter}`} style={{ animationDelay: "280ms" }}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">This week</p>
            <div className="grid grid-cols-3 divide-x divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/50 backdrop-blur">
              {[
                { label: "tasks done", value: weekTasksDone },
                { label: "meetings", value: weekEvents.length },
                { label: "leave days", value: weekLeaveDays },
              ].map((m) => (
                <div key={m.label} className="px-4 py-5 text-center">
                  <div className="font-mono text-3xl font-semibold tabular-nums text-foreground">{m.value}</div>
                  <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 02 Agenda ─── */}
        <section className="space-y-5">
          <SectionLabel index="02" title="Agenda" />
          <DayPreviewCard today={todayData} tomorrow={tomorrowData} />
        </section>

        {/* ─── 03 Notifications ─── */}
        <section className="space-y-5">
          <SectionLabel index="03" title="Notifications" href="/notifications" badge={unreadCount} />
          <Card className="border-border/60 bg-card/50 backdrop-blur transition-colors hover:border-border">
            <CardContent className="space-y-0.5 pt-6">
              {notifications.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">You&rsquo;re all caught up.</p>
              ) : (
                notifications.map((n) => <NotificationRow key={n.id} notification={n} />)
              )}
            </CardContent>
          </Card>
        </section>

        {/* ─── 04 Pull requests (only when GitHub has open PRs) ─── */}
        {topPullRequests.length > 0 ? (
          <section className="space-y-5">
            <SectionLabel index="04" title="Pull requests" href="/pull-requests" />
            <Card className="border-border/60 bg-card/50 backdrop-blur transition-colors hover:border-border">
              <CardContent className="space-y-0.5 pt-6">
                {topPullRequests.map((pr) => (
                  <Link
                    key={pr.id}
                    href="/pull-requests"
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="truncate">
                      {pr.title} <span className="font-mono text-xs text-muted-foreground">#{pr.number}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{pr.repo}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        ) : null}

        {/* ─── Analytics: Tasks by status + Leave (one row) ─── */}
        <section className="space-y-5">
          <SectionLabel index={`0${4 + prIndexOffset}`} title="Analytics" />
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/50 backdrop-blur transition-colors hover:border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconChip>
                    <Activity className="h-3.5 w-3.5" />
                  </IconChip>
                  Tasks by status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TaskStatusBar todo={taskCounts.todo} inProgress={taskCounts.in_progress} done={taskCounts.done} />
              </CardContent>
            </Card>
            <DashboardCharts leaveByMonth={leaveByMonth} />
          </div>
        </section>

        {/* ─── Profiles ─── */}
        <section className="space-y-5">
          <SectionLabel index={`0${5 + prIndexOffset}`} title="Profiles" />
          <Card className="border-border/60 bg-card/50 backdrop-blur transition-colors hover:border-border">
            <CardContent className="flex flex-wrap gap-2 pt-6">
              {profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No profiles yet.</p>
              ) : (
                profiles.map((pr) => (
                  <Button key={pr.id} asChild variant="outline" size="sm">
                    <a href={pr.url} target="_blank" rel="noreferrer">
                      {pr.label}
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ index, title, href, badge }: { index: string; title: string; href?: string; badge?: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs font-medium text-primary">{index}</span>
      <h2 className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-foreground/70">{title}</h2>
      {badge && badge > 0 ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      {href ? <ViewAllLink href={href} /> : null}
    </div>
  );
}

function FocusChip({
  href,
  icon: Icon,
  label,
  sub,
  tone,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/70 px-3.5 py-2.5 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset", tone)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 pr-1">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        {sub ? <span className="block max-w-[15rem] truncate text-xs text-muted-foreground">{sub}</span> : null}
      </span>
    </Link>
  );
}

function IconChip({ children }: { children: ReactNode }) {
  return <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/12 text-primary">{children}</span>;
}

function ViewAllLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="group/link flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
    >
      View all
      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
    </Link>
  );
}

function StatCard({
  href,
  icon,
  label,
  value,
  sub,
  delay = 0,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  delay?: number;
}) {
  return (
    <Link
      href={href}
      className="group animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/50 group-hover:glow-primary">
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-70" />
        <span className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/10 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="flex items-start justify-between">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-chart-2 text-white shadow-md shadow-primary/25">
            {icon}
          </span>
          <ArrowUpRight className="size-4 text-muted-foreground/30 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        <div className="mt-5 font-mono text-4xl font-semibold tabular-nums tracking-tight">{value}</div>
        <div className="mt-1.5 text-sm font-medium text-foreground">{label}</div>
        {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
      </div>
    </Link>
  );
}



function NotificationRow({ notification }: { notification: NotificationView }) {
  return (
    <a
      href={notification.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
        <span className="truncate text-sm">{notification.title}</span>
      </div>
      <div className="ml-3.5 truncate text-xs text-muted-foreground">
        {notificationActor(notification)} · {notificationTitle(notification)} ·{" "}
        {formatDistanceToNow(notification.occurredAt ?? notification.createdAt, { addSuffix: true })}
      </div>
      {notification.type === "mentioned" && notification.message ? (
        <p className="ml-3.5 mt-1 truncate rounded-md bg-muted/50 px-2 py-1 text-xs text-foreground/80">
          {notification.message}
        </p>
      ) : null}
    </a>
  );
}

function TaskStatusBar({ todo, inProgress, done }: { todo: number; inProgress: number; done: number }) {
  const total = todo + inProgress + done;
  const segments = [
    { label: "To Do", count: todo, className: "bg-muted-foreground/30" },
    { label: "In Progress", count: inProgress, className: "bg-primary" },
    { label: "Done", count: done, className: "bg-chart-2" },
  ];

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {segments.map((s) =>
          s.count > 0 ? (
            <div key={s.label} className={s.className} style={{ width: `${(s.count / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${s.className}`} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular-nums">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
