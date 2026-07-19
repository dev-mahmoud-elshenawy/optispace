"use client";

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  CircleDot,
  GitCommit,
  GitMerge,
  Loader2,
  MessageSquare,
  RotateCcw,
  Tag,
  Upload,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { getPullRequestTimeline } from "./actions";
import type { TimelineItem, TimelineKind } from "./types";

const htmlBox =
  "max-w-none rounded-md border border-border/60 bg-background p-2.5 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_img]:rounded [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_code]:text-xs [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5";

const ICON: Record<TimelineKind, LucideIcon> = {
  commit: GitCommit,
  comment: MessageSquare,
  review: MessageSquare,
  merged: GitMerge,
  closed: XCircle,
  reopened: RotateCcw,
  review_requested: UserPlus,
  assigned: UserPlus,
  labeled: Tag,
  pushed: Upload,
  other: CircleDot,
};

// Node dot tint per event — colour carries meaning so the feed is scannable at a glance.
function nodeTint(it: TimelineItem): string {
  switch (it.kind) {
    case "commit":
    case "pushed":
      return "border-indigo-500/40 bg-indigo-500/10 text-indigo-500";
    case "merged":
      return "border-violet-500/40 bg-violet-500/10 text-violet-500";
    case "closed":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "reopened":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
    case "review":
      if (it.state === "APPROVED") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
      if (it.state === "CHANGES_REQUESTED") return "border-destructive/40 bg-destructive/10 text-destructive";
      return "border-sky-500/40 bg-sky-500/10 text-sky-500";
    case "review_requested":
    case "assigned":
      return "border-sky-500/40 bg-sky-500/10 text-sky-500";
    case "labeled":
      return "border-amber-500/40 bg-amber-500/10 text-amber-500";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function PrTimeline({ nodeId, repo, number }: { nodeId: string | null; repo: string; number: number }) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(null);
    getPullRequestTimeline(nodeId, repo, number).then((res) => {
      if (!active) return;
      if (res.ok) setItems(res.timeline);
      else setError(res.error);
    });
    return () => {
      active = false;
    };
  }, [nodeId, repo, number]);

  if (error) {
    return <p className="py-6 text-sm text-destructive">{error}</p>;
  }
  if (items === null) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading activity…
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No activity yet.</p>;
  }

  const commitCount = items.filter((i) => i.kind === "commit").length;

  return (
    <div className="space-y-3 pb-2">
      {commitCount > 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitCommit className="size-3.5 text-indigo-500" />
          <span>
            <span className="font-medium text-foreground">{commitCount}</span> commit
            {commitCount === 1 ? "" : "s"} · <span className="font-medium text-foreground">{items.length}</span> event
            {items.length === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}

      {/* Vertical rail: a hairline behind the node dots connects the feed. */}
      <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-border">
        {items.map((it, i) => {
          const Icon = ICON[it.kind] ?? CircleDot;
          const isCommit = it.kind === "commit";
          return (
            <li key={i} className="relative flex gap-3">
              <span
                className={cn(
                  "z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border",
                  nodeTint(it),
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 space-y-1 pt-1">
                {isCommit ? (
                  <p className="flex items-center gap-2 text-sm">
                    {it.sha ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {it.sha}
                      </code>
                    ) : null}
                    <span className="min-w-0 truncate font-medium">{it.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{it.actor}</span>
                  </p>
                ) : (
                  <p className="text-sm">
                    <span className="font-medium">{it.actor}</span> {it.title}
                  </p>
                )}
                {it.createdAt ? (
                  <p className="text-xs text-muted-foreground" title={format(new Date(it.createdAt), "PPpp")}>
                    {formatDistanceToNow(new Date(it.createdAt), { addSuffix: true })}
                  </p>
                ) : null}
                {it.bodyHtml ? <div className={htmlBox} dangerouslySetInnerHTML={{ __html: it.bodyHtml }} /> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
