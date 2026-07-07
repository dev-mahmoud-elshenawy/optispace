import { Plus } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/features/projects/components/project-card";
import { ProjectFormDialog } from "@/features/projects/components/project-form-dialog";
import { listProjectFilesMeta, listProjects } from "@/features/projects/queries";
import type { ProjectFileMeta } from "@/features/projects/service";
import { listTasks } from "@/features/tasks/queries";
import type { TaskView } from "@/features/tasks/service";

export default async function ProjectsPage() {
  const [projects, tasks, files] = await Promise.all([listProjects(), listTasks(), listProjectFilesMeta()]);

  const tasksByProject = new Map<string, TaskView[]>();
  for (const task of tasks) {
    if (!task.projectId) continue;
    const existing = tasksByProject.get(task.projectId);
    if (existing) existing.push(task);
    else tasksByProject.set(task.projectId, [task]);
  }

  const filesByProject = new Map<string, ProjectFileMeta[]>();
  for (const file of files) {
    const existing = filesByProject.get(file.projectId);
    if (existing) existing.push(file);
    else filesByProject.set(file.projectId, [file]);
  }

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
      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No projects yet — add your first one to start tracking progress.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              tasks={tasksByProject.get(project.id) ?? []}
              files={filesByProject.get(project.id) ?? []}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
