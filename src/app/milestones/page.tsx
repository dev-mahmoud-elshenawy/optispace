import { Milestone as MilestoneIcon } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MilestoneChecklist } from "@/features/projects/components/milestone-checklist";
import { listProjects } from "@/features/projects/queries";

export const dynamic = "force-dynamic";

export default async function MilestonesPage() {
  const projects = await listProjects();
  const total = projects.reduce((n, p) => n + p.milestones.length, 0);
  const done = projects.reduce((n, p) => n + p.milestones.filter((m) => m.done).length, 0);

  return (
    <PageShell
      title="Milestones"
      description={
        total > 0
          ? `${done} of ${total} complete across ${projects.length} project${projects.length === 1 ? "" : "s"}`
          : "Track milestones across all your projects"
      }
    >
      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <MilestoneIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No projects yet — create a project to start tracking milestones.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {projects.map((project) => {
            const projectDone = project.milestones.filter((m) => m.done).length;
            const projectTotal = project.milestones.length;
            const pct = projectTotal > 0 ? Math.round((projectDone / projectTotal) * 100) : 0;
            return (
              <Card key={project.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="truncate">{project.name}</span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      {projectDone}/{projectTotal}
                    </span>
                  </CardTitle>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </CardHeader>
                <CardContent>
                  <MilestoneChecklist projectId={project.id} milestones={project.milestones} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
