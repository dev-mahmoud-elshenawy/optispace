"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { archiveKindLabel, type ArchivedItem } from "../types";
import { purgeArchive, purgeItem, restoreItem } from "../actions";

interface ArchiveListProps {
  items: ArchivedItem[];
}

export function ArchiveList({ items }: ArchiveListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  function handleRestore(item: ArchivedItem) {
    setRestoringId(item.id);
    startTransition(async () => {
      const result = await restoreItem(item.kind, item.id);
      if (result.ok) {
        toast.success(`Restored ${archiveKindLabel(item.kind).toLowerCase()}.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setRestoringId(null);
    });
  }

  function handlePurge(item: ArchivedItem) {
    if (!window.confirm(`Permanently delete "${item.label}"? This can't be undone.`)) return;
    setRestoringId(item.id);
    startTransition(async () => {
      const result = await purgeItem(item.kind, item.id);
      if (result.ok) {
        toast.success("Permanently deleted.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setRestoringId(null);
    });
  }

  function handleEmpty() {
    if (!window.confirm("Permanently delete everything in the archive? This can't be undone.")) return;
    startTransition(async () => {
      const result = await purgeArchive();
      if (result.ok) {
        toast.success("Archive emptied.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted-foreground">Nothing archived. Deleted items land here so you can restore them.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEmpty}
          disabled={pending}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Empty archive
        </Button>
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
      {items.map((item) => (
        <div key={`${item.kind}-${item.id}`} className="flex items-center gap-3 px-4 py-3">
          <Badge variant="outline" className="shrink-0">
            {archiveKindLabel(item.kind)}
          </Badge>
          <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            deleted {formatDistanceToNow(item.deletedAt, { addSuffix: true })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRestore(item)}
            disabled={pending && restoringId === item.id}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handlePurge(item)}
            disabled={pending && restoringId === item.id}
            aria-label="Delete permanently"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      </div>
    </div>
  );
}
