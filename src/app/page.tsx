import Link from "next/link";
import { format } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ListChecks, GitBranch, Package as PackageIcon, ExternalLink, ArrowUpRight, Activity, Link2, Sun, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";
import { listProfiles } from "@/features/profiles/queries";
import { getLeaveSummary, listLeaves } from "@/features/leave/queries";
import { getTaskStatusCounts, listTasks } from "@/features/tasks/queries";
import { STATUS_LABELS, type TaskView } from "@/features/tasks/service";
import { listProjects } from "@/features/projects/queries";
import { countPackages } from "@/features/packages/queries";
import { recentNotifications, unreadNotificationCount } from "@/features/notifications/queries";
import { notificationActor, notificationTitle, type NotificationView } from "@/features/notifications/service";
import { DashboardCharts } from "@/features/dashboard/components/dashboard-charts";
import type { TaskStatus } from "@/types";

export default async function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const [profiles, leave, taskCounts, projects, packageCount, leaves, tasks, notifications, unreadCount] = await Promise.all([
    listProfiles(),
    getLeaveSummary(year),
    getTaskStatusCounts(),
    listProjects(),
    countPackages(),
    listLeaves(year),
    listTasks(),
    recentNotifications(),
    unreadNotificationCount(),
  ]);

  const openTasks = taskCounts.todo + taskCounts.in_progress;
  const activeProjects = projects.filter((p) => p.status === "active");

  const startToday = new Date(year, now.getMonth(), now.getDate());
  const recentTasks = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);

  const endToday = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const dueTodayOrOverdue = tasks
    .filter((t) => t.status !== "done" && t.dueDate !== null && t.dueDate <= endToday)
    .sort((a, b) => (a.dueDate as Date).getTime() - (b.dueDate as Date).getTime());
  const onLeaveToday = leaves.filter((l) => l.startDate <= endToday && l.endDate >= startToday);

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const leaveByMonth = MONTHS.map((month, i) => ({
    month,
    days: leaves.filter((l) => l.startDate.getMonth() === i).reduce((n, l) => n + l.days, 0),
  }));
  const projectProgress = projects
    .filter((p) => p.milestonesTotal > 0)
    .map((p) => ({ name: p.name, pct: Math.round((p.milestonesDone / p.milestonesTotal) * 100) }))
    .slice(0, 6);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = format(now, "EEEE, MMMM d");
  const enter = "animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both";

  return (
    <PageShell title={greeting} description={dateLabel}>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard href="/leave" icon={<CalendarDays className="h-5 w-5" />} label="Remaining leave" value={`${leave.remainingDays}`} sub={`of ${leave.allowanceDays} days`} delay={0} />
        <StatCard href="/tasks" icon={<ListChecks className="h-5 w-5" />} label="Open tasks" value={`${openTasks}`} sub={`${taskCounts.done} done`} delay={75} />
        <StatCard href="/projects" icon={<GitBranch className="h-5 w-5" />} label="Active projects" value={`${activeProjects.length}`} sub={`${projects.length} total`} delay={150} />
        <StatCard href="/packages" icon={<PackageIcon className="h-5 w-5" />} label="Packages" value={`${packageCount}`} sub="published" delay={225} />
      </div>

      {/* Needs attention now — Today + Notifications side by side */}
      <div className={`mt-6 grid gap-6 lg:grid-cols-2 ${enter}`} style={{ animationDelay: "100ms" }}>
        <Card className="border-border/60 transition-colors hover:border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IconChip>
                <Sun className="h-3.5 w-3.5" />
              </IconChip>
              Today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {onLeaveToday.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span>On leave today</span>
                <span className="ml-auto text-xs text-muted-foreground">until {format(l.endDate, "MMM d")}</span>
              </div>
            ))}
            {dueTodayOrOverdue.length === 0 && onLeaveToday.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nothing due today — you&rsquo;re all clear.</p>
            ) : (
              dueTodayOrOverdue.map((t) => {
                const overdue = (t.dueDate as Date) < startToday;
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`size-2 shrink-0 rounded-full ${TASK_DOT_CLASS[t.status]}`} />
                      <span className="truncate">{t.title}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        overdue ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                      }`}
                    >
                      {overdue ? `Overdue · ${format(t.dueDate as Date, "MMM d")}` : "Due today"}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 transition-colors hover:border-border">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconChip>
                <Bell className="h-3.5 w-3.5" />
              </IconChip>
              Notifications
              {unreadCount > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </CardTitle>
            <ViewAllLink href="/notifications" />
          </CardHeader>
          <CardContent className="space-y-1">
            {notifications.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">You&rsquo;re all caught up.</p>
            ) : (
              notifications.map((n) => <NotificationRow key={n.id} notification={n} />)
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity — tasks + status breakdown */}
      <div className={`mt-6 grid gap-6 lg:grid-cols-2 ${enter}`} style={{ animationDelay: "150ms" }}>
        <Card className="border-border/60 transition-colors hover:border-border">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconChip>
                <ListChecks className="h-3.5 w-3.5" />
              </IconChip>
              Recent tasks
            </CardTitle>
            <ViewAllLink href="/tasks" />
          </CardHeader>
          <CardContent className="space-y-1">
            {recentTasks.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No open tasks.</p>
            ) : (
              recentTasks.map((t) => <RecentTaskRow key={t.id} task={t} />)
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 transition-colors hover:border-border">
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
      </div>

      <div className={`mt-6 ${enter}`} style={{ animationDelay: "300ms" }}>
        <DashboardCharts leaveByMonth={leaveByMonth} projectProgress={projectProgress} />
      </div>

      <Card className={`mt-6 border-border/60 transition-colors hover:border-border ${enter}`} style={{ animationDelay: "350ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconChip>
              <Link2 className="h-3.5 w-3.5" />
            </IconChip>
            Profiles
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
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
    </PageShell>
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
      <Card className="relative overflow-hidden border-border/60 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:glow-primary">
        <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-chart-2 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-90" />
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-chart-2 text-white shadow-sm shadow-primary/30">
              {icon}
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
          </div>
          <div className="mt-4 font-heading text-4xl font-bold tracking-tight tabular-nums">{value}</div>
          <div className="mt-1 text-sm font-medium text-foreground">{label}</div>
          {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
        </CardContent>
      </Card>
    </Link>
  );
}


const TASK_DOT_CLASS: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/40",
  in_progress: "bg-primary",
  done: "bg-chart-2",
};

function RecentTaskRow({ task }: { task: TaskView }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${TASK_DOT_CLASS[task.status]}`} />
        <span className="truncate">{task.title}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {task.projectName ?? STATUS_LABELS[task.status]}
      </span>
    </div>
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
