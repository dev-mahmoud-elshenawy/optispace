"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, GitFork, Loader2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { registryLabel, registryProvider, type PackageView } from "../service";
import { getPackageVersionHistory } from "../actions";
import type { VersionHistoryEntry } from "../registry";

const LANGUAGE_LABEL: Record<string, string> = {
  dart_flutter: "Dart / Flutter",
  js_react: "React",
  js_react_native: "React Native",
};

interface PackageDetailDialogProps {
  pkg: PackageView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PackageDetailDialog({ pkg, open, onOpenChange }: PackageDetailDialogProps) {
  const [versions, setVersions] = useState<VersionHistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const provider = registryProvider(pkg.registry);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setVersions(null);
    void getPackageVersionHistory(pkg.id)
      .then((v) => {
        if (!cancelled) setVersions(v);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pkg.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-all">{pkg.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{registryLabel(pkg.registry)}</Badge>
          <Badge variant="secondary">{LANGUAGE_LABEL[pkg.language] ?? pkg.language}</Badge>
          <Badge variant="outline" className="capitalize">{pkg.status}</Badge>
          {pkg.vulnerable ? (
            <Badge variant="destructive" className="gap-1" asChild>
              <a href={pkg.advisoryUrl ?? "https://osv.dev"} target="_blank" rel="noreferrer">
                <ShieldAlert className="size-3" /> Vulnerable
              </a>
            </Badge>
          ) : null}
        </div>

        {pkg.description ? <p className="text-sm text-muted-foreground">{pkg.description}</p> : null}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Current">{pkg.currentVersion ?? "—"}</Stat>
          <Stat label="Latest">{pkg.latestVersion ?? "—"}</Stat>
          {provider === "npm" ? (
            <Stat label="Downloads/wk">{pkg.weeklyDownloads?.toLocaleString() ?? "—"}</Stat>
          ) : provider === "pubdev" ? (
            <>
              <Stat label="Likes">{pkg.likes ?? "—"}</Stat>
              <Stat label="Pub points">{pkg.pubPoints ?? "—"}</Stat>
            </>
          ) : null}
        </div>

        {pkg.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {pkg.tags.map((tag) => (
              <Badge key={tag} variant="ghost">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-3 text-sm">
          {pkg.registryUrl ? (
            <a href={pkg.registryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="size-3.5" /> Registry
            </a>
          ) : null}
          {pkg.githubUrl ? (
            <a href={pkg.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <GitFork className="size-3.5" /> GitHub
            </a>
          ) : null}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium">Version history</h4>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading from {registryLabel(pkg.registry)}…
            </p>
          ) : !versions || versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {provider ? "No version history available." : "Version history is only available for npm and pub.dev packages."}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {versions.map((v) => (
                <li key={v.version} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={cn("font-mono", v.version === pkg.currentVersion && "font-semibold text-primary")}>{v.version}</span>
                    {v.version === pkg.currentVersion ? <Badge variant="secondary" className="text-[10px]">current</Badge> : null}
                    {v.version === pkg.latestVersion && v.version !== pkg.currentVersion ? (
                      <Badge variant="default" className="text-[10px]">latest</Badge>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {v.published ? formatDistanceToNow(new Date(v.published), { addSuffix: true }) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono tabular-nums">{children}</p>
    </div>
  );
}
