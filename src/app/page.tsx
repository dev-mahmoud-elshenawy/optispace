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
import { listTasks } from "@/features/tasks/queries";
import { listProjects } from "@/features/projects/queries";
import { countPackages } from "@/features/packages/queries";
import { recentNotifications, unreadNotificationCount } from "@/features/notifications/queries";
import { notificationActor, notificationTitle, type NotificationView } from "@/features/notifications/service";
import { todayCalendarEvents } from "@/features/calendar/queries";
import { listPullRequests } from "@/features/integrations/github/queries";
import { workItemTypeColor } from "@/features/integrations/azure-devops/types";
import { getGithubAuthStatus } from "@/features/integrations/github/actions";
import { DayPreviewCard } from "@/components/dashboard/day-preview-card";
import { DashboardCharts } from "@/features/dashboard/components/dashboard-charts";
import { ProfileIcon } from "@/features/profiles/components/profile-icon";
import { AnimatedNumber } from "@/components/dashboard/animated-number";

export default async function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const startToday = new Date(year, now.getMonth(), now.getDate());
  const endToday = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startTomorrow = new Date(year, now.getMonth(), now.getDate() + 1);
  const endTomorrow = new Date(year, now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
  const [profiles, leave, projects, packageCount, leaves, tasks, notifications, unreadCount, todayEvents, tomorrowEvents, pullRequests, githubAuth] = await Promise.all([
    listProfiles(),
    getLeaveSummary(year),
    listProjects(),
    countPackages(),
    listLeaves(year),
    listTasks(),
    recentNotifications(),
    unreadNotificationCount(),
    todayCalendarEvents(startToday, endToday),
    todayCalendarEvents(startTomorrow, endTomorrow),
    listPullRequests(),
    getGithubAuthStatus(),
  ]);
  const topPullRequests = pullRequests.slice(0, 12);
  const hasPRs = topPullRequests.length > 0;
  // "Today's focus" — the day's urgent items, surfaced in one strip at the top.
  const upcomingMeetings = todayEvents.filter((e) => new Date(e.end) >= now);
  // Open PRs where I'm a reviewer or assignee (not my own). The sync fetches author/review-requested/
  // assignee PRs, so "involves me" = author isn't my login. reviewDecision is null for these repos, so
  // a strict "needs review" count would always be 0 — relation is the meaningful signal here.
  const myLogin = githubAuth.login;
  const prsForMe = myLogin ? pullRequests.filter((p) => p.author !== myLogin).length : pullRequests.length;

  // "Open work" analytics — derived from the tasks already fetched above, so no extra query.
  // Done is deliberately absent: closed ADO items are pruned on sync, so a done count is
  // structurally ~0 and was only ever counting stray local tasks.
  const openTaskList = tasks.filter((t) => t.status !== "done");
  const openTasks = openTaskList.length;
  const tally = (key: (t: (typeof openTaskList)[number]) => string) => {
    const counts = new Map<string, number>();
    for (const t of openTaskList) counts.set(key(t), (counts.get(key(t)) ?? 0) + 1);
    return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };
  const workByType = tally((t) => t.workItemType ?? "Local");
  const workByProject = tally((t) => t.projectName ?? "No project");
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

  const focusCount = upcomingMeetings.length + dueTodayOrOverdue.length + prsForMe + unreadCount;

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
                {prsForMe > 0 ? (
                  <FocusChip
                    href="/pull-requests"
                    icon={GitPullRequest}
                    tone="bg-indigo-500/15 text-indigo-400 ring-indigo-500/25"
                    label={`${prsForMe} PR${prsForMe === 1 ? "" : "s"} for you`}
                    sub="Review-requested or assigned"
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
            <StatCard href="/leave" icon={<CalendarDays className="size-5" />} label="Remaining leave" value={leave.remainingDays} sub={`of ${leave.allowanceDays} days`} delay={0} />
            <StatCard href="/tasks" icon={<ListChecks className="size-5" />} label="Open tasks" value={openTasks} sub={`${workByProject.length} projects`} delay={70} />
            <StatCard href="/projects" icon={<GitBranch className="size-5" />} label="Active projects" value={activeProjects.length} sub={`${projects.length} total`} delay={140} />
            <StatCard href="/packages" icon={<PackageIcon className="size-5" />} label="Packages" value={packageCount} sub="published" delay={210} />
          </div>
        </section>

        {/* ─── 02 Focus — bento grid of scrollable panels ─── */}
        <section className="space-y-5">
          <SectionLabel index="02" title="Focus" />
          <div className={cn("grid gap-5", hasPRs ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2")}>
            <div className={`h-[440px] ${enter}`} style={{ animationDelay: "0ms" }}>
              <DayPreviewCard today={todayData} tomorrow={tomorrowData} />
            </div>

            <div className={enter} style={{ animationDelay: "80ms" }}>
              <Panel icon={Bell} title="Notifications" href="/notifications" badge={unreadCount}>
                {notifications.length === 0 ? (
                  <EmptyPanel icon={Bell} message="You're all caught up." />
                ) : (
                  notifications.map((n, i) => <NotificationRow key={n.id} notification={n} index={i} />)
                )}
              </Panel>
            </div>

            {hasPRs ? (
              <div className={enter} style={{ animationDelay: "160ms" }}>
                <Panel icon={GitPullRequest} title="Pull requests" href="/pull-requests" badge={prsForMe}>
                  {topPullRequests.map((pr, i) => (
                    <Link
                      key={pr.id}
                      href="/pull-requests"
                      style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                      className="group/row flex animate-in fade-in slide-in-from-bottom-2 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm fill-mode-both transition-colors duration-300 hover:bg-accent/50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <GitPullRequest className="size-3.5 shrink-0 text-primary transition-transform group-hover/row:scale-110" />
                        <span className="truncate">
                          {pr.title} <span className="font-mono text-xs text-muted-foreground">#{pr.number}</span>
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{pr.repo.slice(pr.repo.indexOf("/") + 1)}</span>
                    </Link>
                  ))}
                </Panel>
              </div>
            ) : null}
          </div>
        </section>

        {/* ─── Analytics: Tasks by status + Leave (one row) ─── */}
        <section className="space-y-5">
          <SectionLabel index="03" title="Analytics" />
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/50 backdrop-blur transition-colors hover:border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconChip>
                    <Activity className="h-3.5 w-3.5" />
                  </IconChip>
                  Open work
                  <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">{openTasks} open</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OpenWorkPanel total={openTasks} types={workByType} projects={workByProject} />
              </CardContent>
            </Card>
            <DashboardCharts leaveByMonth={leaveByMonth} />
          </div>
        </section>

        {/* ─── Profiles ─── */}
        <section className="space-y-5">
          <SectionLabel index="04" title="Profiles" />
          <Card className="border-border/60 bg-card/50 backdrop-blur transition-colors hover:border-border">
            <CardContent className="flex flex-wrap gap-2 pt-6">
              {profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No profiles yet.</p>
              ) : (
                profiles.map((pr) => (
                  <Button key={pr.id} asChild variant="outline" size="sm">
                    <a href={pr.url} target="_blank" rel="noreferrer">
                      <ProfileIcon icon={pr.icon} className="size-3.5" />
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
  value: number;
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
        <div className="mt-5 font-mono text-4xl font-semibold tabular-nums tracking-tight">
          <AnimatedNumber value={value} />
        </div>
        <div className="mt-1.5 text-sm font-medium text-foreground">{label}</div>
        {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
      </div>
    </Link>
  );
}



// Reusable scrollable bento panel — a header with icon + title + optional badge/view-all,
// and a masked, custom-scrollbar body. Shared shape with the Agenda panel.
function Panel({
  icon: Icon,
  title,
  href,
  badge,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  href?: string;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <div className="group relative flex h-[440px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/50 backdrop-blur transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
        <span className="block h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />
      </span>
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-chart-2/10 text-primary ring-1 ring-inset ring-primary/20">
          <Icon className="size-4" />
        </span>
        <span className="font-heading text-sm font-semibold">{title}</span>
        {badge && badge > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
        {href ? (
          <span className="ml-auto">
            <ViewAllLink href={href} />
          </span>
        ) : null}
      </div>
      <div className="panel-scroll scroll-mask flex-1 space-y-0.5 overflow-y-auto px-4 py-3">{children}</div>
    </div>
  );
}

function EmptyPanel({ icon: Icon, message }: { icon: ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-emerald-500/10 text-emerald-500">
        <Icon className="size-5" />
      </span>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function NotificationRow({ notification, index = 0 }: { notification: NotificationView; index?: number }) {
  return (
    <a
      href={notification.url}
      target="_blank"
      rel="noreferrer"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
      className="group/row block animate-in fade-in slide-in-from-bottom-2 rounded-lg px-2.5 py-2 fill-mode-both transition-colors duration-300 hover:bg-accent/50"
    >
      <div className="flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-primary transition-transform group-hover/row:scale-125" />
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

// Open work: a DevOps-colored work-item-type mix strip + the load per project. Both come from
// fields that are actually populated on every synced task (dueDate is empty, effort is set on
// ~1 in 9, adoPriority is the same value for nearly all — those make for dead charts).
const PROJECT_ROWS = 6;

function OpenWorkPanel({
  total,
  types,
  projects,
}: {
  total: number;
  types: { label: string; count: number }[];
  projects: { label: string; count: number }[];
}) {
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No open tasks.</p>;
  }

  const top = projects.slice(0, PROJECT_ROWS);
  const rest = projects.slice(PROJECT_ROWS);
  const restCount = rest.reduce((sum, p) => sum + p.count, 0);
  const max = top[0]?.count ?? 1;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {types.map((t) => (
            <div
              key={t.label}
              style={{ width: `${(t.count / total) * 100}%`, backgroundColor: workItemTypeColor(t.label) }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {types.map((t) => (
            <span key={t.label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: workItemTypeColor(t.label) }} />
              <span className="text-muted-foreground">{t.label}</span>
              <span className="font-mono text-xs font-semibold tabular-nums">{t.count}</span>
            </span>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {top.map((p) => (
          <li key={p.label} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 truncate text-muted-foreground" title={p.label}>
              {p.label}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${(p.count / max) * 100}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums">{p.count}</span>
          </li>
        ))}
        {rest.length > 0 ? (
          <li className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
            <span className="w-32 shrink-0 truncate">+{rest.length} others</span>
            <span className="flex-1" />
            <span className="w-8 shrink-0 text-right font-mono tabular-nums">{restCount}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export const dynamic = "force-dynamic";
