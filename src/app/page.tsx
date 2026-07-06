import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ListChecks, GitBranch, Package as PackageIcon, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { listProfiles } from "@/features/profiles/queries";
import { getLeaveSummary } from "@/features/leave/queries";
import { getTaskStatusCounts } from "@/features/tasks/queries";
import { listProjects } from "@/features/projects/queries";
import { countPackages } from "@/features/packages/queries";

export default async function DashboardPage() {
  const year = new Date().getFullYear();
  const [profiles, leave, taskCounts, projects, packageCount] = await Promise.all([
    listProfiles(),
    getLeaveSummary(year),
    getTaskStatusCounts(),
    listProjects(),
    countPackages(),
  ]);

  const openTasks = taskCounts.todo + taskCounts.in_progress;
  const activeProjects = projects.filter((p) => p.status === "active");

  return (
    <PageShell title="Dashboard" description={`Your workspace at a glance — ${year}`}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<CalendarDays className="h-4 w-4" />} label="Remaining leave" value={`${leave.remainingDays}`} sub={`of ${leave.allowanceDays} days`} />
        <StatCard icon={<ListChecks className="h-4 w-4" />} label="Open tasks" value={`${openTasks}`} sub={`${taskCounts.done} done`} />
        <StatCard icon={<GitBranch className="h-4 w-4" />} label="Active projects" value={`${activeProjects.length}`} sub={`${projects.length} total`} />
        <StatCard icon={<PackageIcon className="h-4 w-4" />} label="Packages" value={`${packageCount}`} sub="published" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tasks by status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <StatusRow label="To Do" count={taskCounts.todo} />
            <StatusRow label="In Progress" count={taskCounts.in_progress} />
            <StatusRow label="Done" count={taskCounts.done} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active projects.</p>
            ) : (
              activeProjects.map((p) => (
                <div key={p.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">{p.progressPct}%</span>
                  </div>
                  <Progress value={p.progressPct} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Profiles</CardTitle>
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

function StatCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant="secondary">{count}</Badge>
    </div>
  );
}

export const dynamic = "force-dynamic";
