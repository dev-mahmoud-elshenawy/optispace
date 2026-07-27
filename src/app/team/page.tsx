import { PageShell } from "@/components/layout/page-shell";
import { getAzureDevOpsProjects } from "@/features/integrations/azure-devops/actions";
import { isAzureDevOpsEnabled } from "@/features/integrations/azure-devops/service";
import { TeamView } from "@/features/team/components/team-view";

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
        <TeamView projects={projects} />
      )}
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
