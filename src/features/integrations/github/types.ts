// Client-safe types/labels for GitHub PRs (no "server-only" — the UI imports these).

export interface PullRequestView {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: string;
  draft: boolean;
  author: string;
  reviewDecision: string | null;
  checksStatus: string | null;
  headBranch: string;
  baseBranch: string;
  updatedAtRemote: Date;
}

// Review decision → badge tint. REVIEW_REQUIRED = still needs a look (amber),
// CHANGES_REQUESTED = blocked (red), APPROVED = green.
export const REVIEW_BADGE: Record<string, { label: string; className: string }> = {
  APPROVED: { label: "Approved", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  CHANGES_REQUESTED: { label: "Changes requested", className: "bg-destructive/15 text-destructive" },
  REVIEW_REQUIRED: { label: "Review required", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
};

// CI rollup → badge tint.
export const CHECKS_BADGE: Record<string, { label: string; className: string }> = {
  SUCCESS: { label: "Checks passing", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  FAILURE: { label: "Checks failing", className: "bg-destructive/15 text-destructive" },
  ERROR: { label: "Checks errored", className: "bg-destructive/15 text-destructive" },
  PENDING: { label: "Checks running", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  EXPECTED: { label: "Checks expected", className: "bg-muted text-muted-foreground" },
};
