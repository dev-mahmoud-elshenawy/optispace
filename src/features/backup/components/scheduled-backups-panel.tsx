"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { runScheduledBackup } from "../actions";
import type { ScheduledBackupFile } from "../queries";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "Today" / "Yesterday" / "Jul 15, 2026" from a backup-YYYY-MM-DD.json filename.
function dayLabel(name: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(name);
  if (!m) return name;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const COLLAPSED_COUNT = 4;

export function ScheduledBackupsPanel({ backups }: { backups: ScheduledBackupFile[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

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

  const total = backups.reduce((n, b) => n + b.sizeBytes, 0);
  const visible = expanded ? backups : backups.slice(0, COLLAPSED_COUNT);

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Scheduled backups</CardTitle>
          <CardDescription>
            {backups.length === 0
              ? "Auto-saved daily to a local backups/ folder, kept for 14 days."
              : `${backups.length} daily backup${backups.length === 1 ? "" : "s"} · ${formatSize(total)} · kept 14 days`}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleRunNow} disabled={pending}>
          <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
          Back up now
        </Button>
      </CardHeader>
      <CardContent>
        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scheduled backups yet — one is created automatically once a day while the app is open.
          </p>
        ) : (
          <>
            <ul className={cn("space-y-0.5", expanded && "max-h-60 overflow-y-auto pr-1")}>
              {visible.map((b, i) => (
                <li
                  key={b.name}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-foreground">{dayLabel(b.name)}</span>
                    {i === 0 ? (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        latest
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-xs text-muted-foreground">{formatSize(b.sizeBytes)}</span>
                </li>
              ))}
            </ul>
            {backups.length > COLLAPSED_COUNT ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1.5 px-2 text-xs font-medium text-primary hover:underline"
              >
                {expanded ? "Show less" : `Show all ${backups.length}`}
              </button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
