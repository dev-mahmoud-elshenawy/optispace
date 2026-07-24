"use client";

import { Check, GitPullRequest, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PullRequestView } from "@/features/integrations/github/types";

// Custom event the tasks board/list fire to open the in-app PR modal (mirrors
// `optispace:open-command`). tasks-view listens and renders <GithubPrDetail>.
export const OPEN_PR_EVENT = "optispace:open-pr";

// One-glance tint from the PR's review/checks state. Blocking states win so a red
// badge is never masked by "approved".
function tint(pr: PullRequestView): string {
  if (pr.draft) return "border-muted-foreground/30 bg-muted text-muted-foreground";
  if (pr.reviewDecision === "CHANGES_REQUESTED" || pr.checksStatus === "FAILURE" || pr.checksStatus === "ERROR") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (pr.reviewDecision === "APPROVED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (pr.checksStatus === "PENDING") return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400";
}

function StatusIcon({ pr }: { pr: PullRequestView }) {
  if (pr.checksStatus === "PENDING") return <Loader2 className="size-3 animate-spin" />;
  if (pr.reviewDecision === "CHANGES_REQUESTED" || pr.checksStatus === "FAILURE" || pr.checksStatus === "ERROR") {
    return <X className="size-3" />;
  }
  if (pr.reviewDecision === "APPROVED") return <Check className="size-3" />;
  return <GitPullRequest className="size-3" />;
}

interface LinkedPrBadgeProps {
  pr: PullRequestView;
  className?: string;
}

export function LinkedPrBadge({ pr, className }: LinkedPrBadgeProps) {
  return (
    <button
      type="button"
      title={`${pr.repo} #${pr.number} — ${pr.title}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent<PullRequestView>(OPEN_PR_EVENT, { detail: pr }));
      }}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80",
        tint(pr),
        className,
      )}
    >
      <StatusIcon pr={pr} />
      <span className="tabular-nums">#{pr.number}</span>
    </button>
  );
}
