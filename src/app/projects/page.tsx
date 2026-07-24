import { Plus } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ProjectsView } from "@/features/projects/components/projects-view";
import { ProjectFormDialog } from "@/features/projects/components/project-form-dialog";
import {
  listProjectFeedbackAll,
  listProjectFilesMeta,
  listProjectLinksAll,
  listProjects,
} from "@/features/projects/queries";
import type { ProjectFeedbackItem, ProjectFileMeta, ProjectLinkItem } from "@/features/projects/service";
import { compareProjectsForOrder } from "@/features/projects/service";
import { listProjectTasks } from "@/features/tasks/queries";
import type { TaskView } from "@/features/tasks/service";

function groupByProject<T extends { projectId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const existing = map.get(row.projectId);
    if (existing) existing.push(row);
    else map.set(row.projectId, [row]);
  }
  return map;
}

export default async function ProjectsPage() {
  const [projects, tasks, files, links, feedback] = await Promise.all([
    listProjects(),
    listProjectTasks(),
    listProjectFilesMeta(),
    listProjectLinksAll(),
    listProjectFeedbackAll(),
  ]);

  const tasksByProject = new Map<string, TaskView[]>();
  for (const task of tasks) {
    if (!task.projectId) continue;
    const existing = tasksByProject.get(task.projectId);
    if (existing) existing.push(task);
    else tasksByProject.set(task.projectId, [task]);
  }

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  const filesByProject = groupByProject<ProjectFileMeta>(files);
  const linksByProject = groupByProject<ProjectLinkItem>(links);
  const feedbackByProject = groupByProject<ProjectFeedbackItem>(feedback);

  // Development shows only projects with open work: at least one task that isn't
  // done (all synced tasks are assigned to me). Then order by status so same-status
  // projects cluster instead of intermixing.
  const visibleProjects = projects
    .filter((p) => (tasksByProject.get(p.id) ?? []).some((t) => t.status !== "done"))
    .sort(compareProjectsForOrder); // bookmarked → status → manual drag order → name (shared with Tasks)

  return (
    <PageShell
      title="Development"
      description="In-flight projects"
      actions={
        <ProjectFormDialog
          mode="create"
          trigger={
            <Button size="sm">
              <Plus />
              Add Project
            </Button>
          }
        />
      }
    >
      {visibleProjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? "No projects yet — add your first one to start tracking progress."
              : "No projects with open tasks assigned to you right now."}
          </p>
        </div>
      ) : (
        <ProjectsView
          items={visibleProjects.map((project) => ({
            project,
            tasks: tasksByProject.get(project.id) ?? [],
            files: filesByProject.get(project.id) ?? [],
            links: linksByProject.get(project.id) ?? [],
            feedback: feedbackByProject.get(project.id) ?? [],
          }))}
          projectOptions={projectOptions}
        />
      )}
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
