import { formatDistanceToNow } from "date-fns";

import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db";
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

// Per-integration health shown in each card: item count + the REAL last successful sync time
// (from the config row's lastSyncedAt, falling back to the newest cached item) + the latest error.
export interface IntegrationStats {
  count: number;
  latest: string | null; // relative label ("2 hours ago") of the last successful sync
  lastError: string | null; // latest sync error, if any (cleared on the next success)
}

function stat(
  count: number,
  cachedLatest: Date | null | undefined,
  health: { lastSyncedAt: Date | null; lastError: string | null } | null,
): IntegrationStats {
  const when = health?.lastSyncedAt ?? cachedLatest ?? null;
  return {
    count,
    latest: when ? formatDistanceToNow(when, { addSuffix: true }) : null,
    lastError: health?.lastError ?? null,
  };
}

export default async function SettingsPage() {
  const [scheduledBackups, githubStatus, adoConfig, calendarConfig, adoAgg, calAgg, ghAgg, adoHealth, calHealth, ghHealth] =
    await Promise.all([
      listScheduledBackups(),
      getGithubAuthStatus(),
      getAdoConfig(),
      getCalendarConfig(),
      db.task.aggregate({ where: { source: "azure_devops", deletedAt: null }, _count: true, _max: { updatedAt: true } }),
      db.calendarEvent.aggregate({ where: { deletedAt: null }, _count: true, _max: { updatedAt: true } }),
      db.githubPullRequest.aggregate({ where: { deletedAt: null }, _count: true, _max: { updatedAtRemote: true } }),
      db.adoConfig.findUnique({ where: { id: "singleton" }, select: { lastSyncedAt: true, lastError: true } }),
      db.calendarConfig.findUnique({ where: { id: "singleton" }, select: { lastSyncedAt: true, lastError: true } }),
      db.githubAuth.findUnique({ where: { id: "singleton" }, select: { lastSyncedAt: true, lastError: true } }),
    ]);

  return (
    <PageShell title="Settings" description="Connect integrations and back up your workspace.">
      <div className="space-y-8">
        <section className="space-y-4">
          <SectionHeading>Integrations</SectionHeading>
          <AzureDevOpsConfigPanel config={adoConfig} stats={stat(adoAgg._count, adoAgg._max.updatedAt, adoHealth)} />
          <CalendarConfigPanel config={calendarConfig} stats={stat(calAgg._count, calAgg._max.updatedAt, calHealth)} />
          <GithubConnectPanel status={githubStatus} stats={stat(ghAgg._count, ghAgg._max.updatedAtRemote, ghHealth)} />
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
