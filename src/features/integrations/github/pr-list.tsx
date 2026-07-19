"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleDot,
  Clock,
  ExternalLink,
  GitPullRequest,
  Loader2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { GithubPrDetail } from "./pr-detail";
import { CHECKS_BADGE, REVIEW_BADGE, type PullRequestView } from "./types";

// Small status icons for the checks/review badges — keyed by the same keys as the *_BADGE maps.
const STATUS_ICON: Record<string, typeof Check> = {
  APPROVED: Check,
  CHANGES_REQUESTED: X,
  REVIEW_REQUIRED: Clock,
  SUCCESS: Check,
  FAILURE: X,
  ERROR: X,
  PENDING: Loader2,
  EXPECTED: Clock,
};

// One-glance state → accent colour for the card's left rail + PR icon.
// Blocking states win over positive ones so a red rail is never masked by an "approved" tint.
function prAccent(pr: PullRequestView): { rail: string; icon: string } {
  if (pr.draft) return { rail: "border-l-muted-foreground/40", icon: "text-muted-foreground" };
  if (pr.reviewDecision === "CHANGES_REQUESTED" || pr.checksStatus === "FAILURE" || pr.checksStatus === "ERROR") {
    return { rail: "border-l-destructive", icon: "text-destructive" };
  }
  if (pr.reviewDecision === "APPROVED") return { rail: "border-l-emerald-500", icon: "text-emerald-500" };
  if (pr.checksStatus === "PENDING") return { rail: "border-l-amber-500", icon: "text-amber-500" };
  return { rail: "border-l-indigo-500", icon: "text-indigo-500" };
}

export function PullRequestList({ prs }: { prs: PullRequestView[] }) {
  const [selected, setSelected] = useState<PullRequestView | null>(null);
  const [open, setOpen] = useState(false);

  function openPr(pr: PullRequestView) {
    setSelected(pr);
    setOpen(true);
  }

  return (
    <>
      <div className="space-y-5">
        {groupByRepo(prs).map(([repo, repoPrs]) => (
          <details key={repo} open className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              <h2 className="text-sm font-semibold tracking-tight">{repo}</h2>
              <Badge variant="secondary" className="ml-1 rounded-full px-2 py-0 text-[11px] font-medium">
                {repoPrs.length}
              </Badge>
            </summary>
            <div className="mt-2 space-y-2 pl-1">
              {repoPrs.map((pr) => {
                const review = pr.reviewDecision ? REVIEW_BADGE[pr.reviewDecision] : null;
                const checks = pr.checksStatus ? CHECKS_BADGE[pr.checksStatus] : null;
                const accent = prAccent(pr);
                return (
                  <Card
                    key={pr.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openPr(pr)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPr(pr);
                      }
                    }}
                    className={cn(
                      "group/card flex cursor-pointer items-start gap-3 border-l-4 p-3.5 transition-all",
                      "hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      accent.rail,
                    )}
                  >
                    <GitPullRequest className={cn("mt-0.5 size-4 shrink-0", accent.icon)} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 font-medium leading-snug">
                          {pr.title}{" "}
                          <span className="font-normal text-muted-foreground">#{pr.number}</span>
                        </span>
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 inline-flex shrink-0 items-center rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover/card:opacity-100 focus:opacity-100"
                          aria-label="Open on GitHub"
                          title="Open on GitHub"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{pr.author}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px]">
                          <span className="truncate rounded bg-muted px-1 py-0.5">{pr.headBranch}</span>
                          <ArrowRight className="size-3 shrink-0" />
                          <span className="truncate rounded bg-muted px-1 py-0.5">{pr.baseBranch}</span>
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span suppressHydrationWarning>
                          {formatDistanceToNow(pr.updatedAtRemote, { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {pr.draft ? (
                          <Badge variant="outline" className="gap-1 font-normal">
                            <CircleDot className="size-3" /> Draft
                          </Badge>
                        ) : null}
                        {review && pr.reviewDecision ? (
                          <StatusBadge k={pr.reviewDecision} label={review.label} className={review.className} />
                        ) : null}
                        {checks && pr.checksStatus ? (
                          <StatusBadge k={pr.checksStatus} label={checks.label} className={checks.className} />
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      {selected ? (
        <GithubPrDetail
          nodeId={selected.nodeId}
          repo={selected.repo}
          number={selected.number}
          title={selected.title}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

function StatusBadge({ k, label, className }: { k: string; label: string; className: string }) {
  const Icon = STATUS_ICON[k];
  return (
    <Badge className={cn("gap-1 border-transparent font-normal", className)}>
      {Icon ? <Icon className={cn("size-3", k === "PENDING" && "animate-spin")} /> : null}
      {label}
    </Badge>
  );
}

// Group PRs by repo. Rows arrive newest-first (updatedAtRemote desc), so each repo keeps
// that order and repos surface in order of their most-recently-updated PR.
function groupByRepo(prs: PullRequestView[]): [string, PullRequestView[]][] {
  const groups = new Map<string, PullRequestView[]>();
  for (const pr of prs) {
    const list = groups.get(pr.repo);
    if (list) list.push(pr);
    else groups.set(pr.repo, [pr]);
  }
  return [...groups.entries()];
}
