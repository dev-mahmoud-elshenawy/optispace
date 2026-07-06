import { Plus } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/features/projects/components/project-card";
import { ProjectFormDialog } from "@/features/projects/components/project-form-dialog";
import { listProjects } from "@/features/projects/queries";

export default async function ProjectsPage() {
  const projects = await listProjects();

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
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
