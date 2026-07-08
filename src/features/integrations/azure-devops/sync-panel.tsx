"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { syncAzureDevOps } from "@/features/integrations/azure-devops/actions";

export function AzureDevOpsPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [isSyncing, startSync] = useTransition();

  function handleSync() {
    startSync(async () => {
      const result = await syncAzureDevOps();
      if (result.ok) {
        toast.success(`Azure DevOps: ${result.imported} imported, ${result.updated} updated, ${result.pruned} removed.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Azure DevOps</CardTitle>
        <CardDescription>
          {enabled
            ? "Imports work items assigned to you into Tasks (auto-syncs while the app is open)."
            : "Not configured — set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT in .env, then restart the app."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleSync} disabled={!enabled || isSyncing}>
          <RefreshCw className={cn(isSyncing && "animate-spin")} />
          Sync now
        </Button>
      </CardContent>
    </Card>
  );
}
