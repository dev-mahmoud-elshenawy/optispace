"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { runScheduledBackup } from "../actions";
import type { ScheduledBackupFile } from "../queries";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScheduledBackupsPanel({ backups }: { backups: ScheduledBackupFile[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRunNow() {
    startTransition(async () => {
      const result = await runScheduledBackup();
      if (result.ok) {
        toast.success(result.created ? "Backup created." : "Already backed up today.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Scheduled backups</CardTitle>
          <CardDescription>Auto-saved daily to a local backups/ folder, kept for 14 days.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleRunNow} disabled={pending}>
          <RefreshCw className="h-4 w-4" />
          Back up now
        </Button>
      </CardHeader>
      <CardContent>
        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scheduled backups yet — one is created automatically once a day while the app is open.
          </p>
        ) : (
          <ul className="space-y-1">
            {backups.map((b) => (
              <li key={b.name} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{b.name}</span>
                <span className="text-xs text-muted-foreground">{formatSize(b.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
