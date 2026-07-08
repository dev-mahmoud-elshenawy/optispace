"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ArrowUpCircle, ExternalLink, GitFork, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PackageStatus } from "@/types";
import type { PackageView } from "../service";
import { deletePackage, refreshPackageStats } from "../actions";

const REGISTRY_LABEL: Record<string, string> = { npm: "npm", pubdev: "pub.dev" };
const LANGUAGE_LABEL: Record<string, string> = {
  dart_flutter: "Dart / Flutter",
  js_react: "React",
  js_react_native: "React Native",
};
const STATUS_VARIANT: Record<PackageStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  maintenance: "secondary",
  deprecated: "outline",
};

interface PackageCardProps {
  pkg: PackageView;
  onEdit: (pkg: PackageView) => void;
}

export function PackageCard({ pkg, onEdit }: PackageCardProps) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleRefresh() {
    startRefresh(async () => {
      const result = await refreshPackageStats(pkg.id);
      if (result.ok) toast.success(`Refreshed ${pkg.name}.`);
      else toast.error(result.error);
      router.refresh();
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deletePackage(pkg.id);
      if (result.ok) {
        toast.success(`Deleted ${pkg.name}.`);
        setConfirmOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate">{pkg.name}</CardTitle>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{REGISTRY_LABEL[pkg.registry]}</Badge>
              <Badge variant="secondary">{LANGUAGE_LABEL[pkg.language]}</Badge>
              <Badge variant={STATUS_VARIANT[pkg.status]}>{pkg.status}</Badge>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-sm font-medium text-muted-foreground">{pkg.displayVersion}</span>
            {pkg.hasUpdate ? (
              <Badge variant="default" className="gap-1" title={`${pkg.currentVersion} → ${pkg.latestVersion}`}>
                <ArrowUpCircle className="size-3" />
                Update
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pkg.description ? <p className="text-sm text-muted-foreground">{pkg.description}</p> : null}
        {pkg.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {pkg.tags.map((tag) => (
              <Badge key={tag} variant="ghost">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {pkg.registry === "npm" ? (
            <span>{pkg.weeklyDownloads !== null ? `${pkg.weeklyDownloads.toLocaleString()} downloads/wk` : "No download stats yet"}</span>
          ) : (
            <>
              <span>{pkg.likes !== null ? `${pkg.likes} likes` : "No likes yet"}</span>
              <span>{pkg.pubPoints !== null ? `${pkg.pubPoints} pub points` : "No pub points yet"}</span>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {pkg.lastSyncedAt ? `Synced ${formatDistanceToNow(pkg.lastSyncedAt, { addSuffix: true })} ago` : "Never synced"}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {pkg.registryUrl ? (
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={pkg.registryUrl} target="_blank" rel="noreferrer" aria-label="Open registry page">
                <ExternalLink />
              </a>
            </Button>
          ) : null}
          {pkg.githubUrl ? (
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={pkg.githubUrl} target="_blank" rel="noreferrer" aria-label="Open GitHub repo">
                <GitFork />
              </a>
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={handleRefresh} disabled={isRefreshing} aria-label="Refresh stats">
            <RefreshCw className={cn(isRefreshing && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(pkg)} aria-label="Edit package">
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setConfirmOpen(true)} aria-label="Delete package">
            <Trash2 />
          </Button>
        </div>
      </CardFooter>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pkg.name}?</DialogTitle>
            <DialogDescription>This can&rsquo;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
