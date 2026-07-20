import { PageShell } from "@/components/layout/page-shell";
import { getCalendarConfig } from "@/features/calendar/actions";
import { CalendarConfigPanel } from "@/features/calendar/config-panel";
import { BackupPanel } from "@/features/backup/components/backup-panel";
import { ExportPanel } from "@/features/backup/components/export-panel";
import { ScheduledBackupsPanel } from "@/features/backup/components/scheduled-backups-panel";
import { listScheduledBackups } from "@/features/backup/queries";
import { getAdoConfig } from "@/features/integrations/azure-devops/actions";
import { AzureDevOpsConfigPanel } from "@/features/integrations/azure-devops/config-panel";
import { getGithubAuthStatus } from "@/features/integrations/github/actions";
import { GithubConnectPanel } from "@/features/integrations/github/connect-panel";

export default async function SettingsPage() {
  const scheduledBackups = await listScheduledBackups();
  const githubStatus = await getGithubAuthStatus();
  const adoConfig = await getAdoConfig();
  const calendarConfig = await getCalendarConfig();
  return (
    <PageShell title="Settings" description="Connect integrations and back up your workspace.">
      <div className="space-y-8">
        <section className="space-y-4">
          <SectionHeading>Integrations</SectionHeading>
          <AzureDevOpsConfigPanel config={adoConfig} />
          <CalendarConfigPanel config={calendarConfig} />
          <GithubConnectPanel status={githubStatus} />
        </section>

        <section className="space-y-4">
          <SectionHeading>Data &amp; backups</SectionHeading>
          <ScheduledBackupsPanel backups={scheduledBackups} />
          <BackupPanel />
          <ExportPanel />
        </section>

        <p className="text-xs text-muted-foreground">
          OptiSpace is local-first: everything lives in this device&rsquo;s database. Export regularly — it&rsquo;s your
          only backup.
        </p>
      </div>
    </PageShell>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>;
}

export const dynamic = "force-dynamic";
