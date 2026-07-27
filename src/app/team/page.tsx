import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db";
import { getAzureDevOpsProjects } from "@/features/integrations/azure-devops/actions";
import { isAzureDevOpsEnabled } from "@/features/integrations/azure-devops/service";
import { TeamView } from "@/features/team/components/team-view";

// Land on the project you actually work in (most open synced tasks), not whatever sorts first.
async function busiestProject(projects: string[]): Promise<string> {
  const rows = await db.task.groupBy({
    by: ["projectId"],
    where: { deletedAt: null, status: { not: "done" }, source: "azure_devops", projectId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { projectId: "desc" } },
    take: 1,
  });
  const projectId = rows[0]?.projectId;
  const name = projectId
    ? (await db.project.findUnique({ where: { id: projectId }, select: { name: true } }))?.name
    : null;
  return name && projects.includes(name) ? name : projects[0];
}

export default async function TeamPage() {
  const enabled = await isAzureDevOpsEnabled();
  const projects = enabled ? await getAzureDevOpsProjects() : [];

  return (
    <PageShell title="Team" description="The whole team's work in a project — mentor, query, and evaluate.">
      {!enabled ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Azure DevOps isn&rsquo;t configured. Add your org URL and PAT in <code>Settings</code> to read team work.
        </p>
      ) : projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No Azure DevOps projects found for this PAT.
        </p>
      ) : (
        <TeamView projects={projects} defaultProject={await busiestProject(projects)} />
      )}
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
