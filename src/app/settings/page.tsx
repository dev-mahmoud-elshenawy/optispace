import { PageShell } from "@/components/layout/page-shell";
import { BackupPanel } from "@/features/backup/components/backup-panel";
import { ExportPanel } from "@/features/backup/components/export-panel";
import { AzureDevOpsPanel } from "@/features/integrations/azure-devops/sync-panel";
import { isAzureDevOpsEnabled } from "@/features/integrations/azure-devops/service";

export default function SettingsPage() {
  return (
    <PageShell title="Settings" description="Back up and restore your workspace data.">
      <div className="space-y-6">
        <AzureDevOpsPanel enabled={isAzureDevOpsEnabled()} />
        <BackupPanel />
        <ExportPanel />
        <p className="text-xs text-muted-foreground">
          OptiSpace is local-first: everything lives in this device&rsquo;s database. Export regularly — it&rsquo;s your
          only backup.
        </p>
      </div>
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
