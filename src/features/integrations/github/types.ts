// Client-safe types/labels for GitHub PRs (no "server-only" — the UI imports these).

// Full PR view for the in-app detail modal (live-fetched on open). bodyHtml/comment/review
// HTML is already sanitized server-side before it reaches the client.
export interface PullRequestReview {
  author: string;
  state: string; // APPROVED | CHANGES_REQUESTED | COMMENTED | ...
  bodyHtml: string;
  createdAt: string; // ISO
}

// A grouped reaction on a comment (👍 ×3, …) — from GraphQL reactionGroups.
export interface ReactionGroup {
  content: string; // GraphQL enum: THUMBS_UP | THUMBS_DOWN | LAUGH | HOORAY | CONFUSED | HEART | ROCKET | EYES
  count: number;
  viewerReacted: boolean; // the connected user already reacted with this
}

// The 8 reaction types GitHub supports, in its picker order.
export const REACTIONS: { content: string; emoji: string }[] = [
  { content: "THUMBS_UP", emoji: "👍" },
  { content: "THUMBS_DOWN", emoji: "👎" },
  { content: "LAUGH", emoji: "😄" },
  { content: "HOORAY", emoji: "🎉" },
  { content: "CONFUSED", emoji: "😕" },
  { content: "HEART", emoji: "❤️" },
  { content: "ROCKET", emoji: "🚀" },
  { content: "EYES", emoji: "👀" },
];
export const REACTION_EMOJI: Record<string, string> = Object.fromEntries(REACTIONS.map((r) => [r.content, r.emoji]));

export interface PullRequestComment {
  nodeId: string; // GraphQL node id — the subjectId for add/remove reaction
  databaseId: number | null; // REST issue-comment id — for edit / delete
  author: string;
  bodyHtml: string; // sanitized (display)
  body: string; // raw markdown (editing)
  createdAt: string; // ISO
  reactions: ReactionGroup[];
}

// One inline review comment inside a thread anchored to a diff line.
export interface ReviewThreadComment {
  id: string; // GraphQL node id (also the reaction subjectId)
  databaseId: number | null; // REST id — needed to reply / edit / delete via the REST API
  author: string;
  bodyHtml: string; // sanitized (display)
  body: string; // raw markdown (editing)
  createdAt: string;
  reactions: ReactionGroup[];
}

// A resolved/unresolved discussion thread pinned to a file + line in the diff.
export interface ReviewThread {
  id: string;
  path: string;
  line: number | null; // current line (new side for RIGHT, old side for LEFT)
  startLine: number | null; // first line of a multi-line thread (null = single line)
  diffSide: string; // LEFT | RIGHT
  isResolved: boolean;
  isOutdated: boolean;
  comments: ReviewThreadComment[];
}

// The replacement text of the first ```suggestion block in a comment body, or null if none.
// "" means the suggestion deletes the target line(s). Interior newlines are preserved.
export function extractSuggestion(body: string): string | null {
  const m = /```suggestion\n([\s\S]*?)```/.exec(body);
  if (!m) return null;
  return m[1].replace(/\n$/, ""); // drop the newline before the closing fence
}

export type TimelineKind =
  | "commit"
  | "comment"
  | "review"
  | "merged"
  | "closed"
  | "reopened"
  | "review_requested"
  | "assigned"
  | "labeled"
  | "pushed"
  | "other";

// One entry in the PR activity feed.
export interface TimelineItem {
  kind: TimelineKind;
  actor: string;
  createdAt: string; // ISO
  title: string; // one-line summary ("pushed 3 commits", "requested review from X", …)
  bodyHtml?: string; // for comments/reviews
  state?: string; // review state (APPROVED/…)
  sha?: string; // abbreviated commit oid (commit events)
}

// A review comment queued into a pending (batched) review — submitted together via one createReview.
export interface PendingReviewComment {
  path: string;
  line: number; // the line the comment anchors to (new side for RIGHT, old for LEFT)
  side: "LEFT" | "RIGHT";
  startLine: number | null; // multi-line range start (null = single line)
  body: string;
}

// One line of a parsed unified diff.
export interface DiffLine {
  type: "add" | "del" | "context" | "hunk";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

// One commit in the PR — for the "filter diff by commit" picker (Code tab).
export interface PrCommit {
  sha: string; // full oid — used to fetch that commit's diff
  abbreviatedOid: string; // 7-char short sha for display
  parentSha: string; // first-parent oid — the base when diffing a range starting at this commit
  message: string; // first line (subject) of the commit message
  body: string; // remaining commit description (empty when the message is a single line)
  author: string;
  date: string; // ISO
}

// One changed file with its parsed diff.
export interface DiffFile {
  path: string;
  status: string; // added | modified | removed | renamed
  additions: number;
  deletions: number;
  binary: boolean;
  lines: DiffLine[];
}

export interface PullRequestDetail {
  repo: string; // canonical owner/name (from GraphQL) — safe for REST calls
  number: number;
  title: string;
  url: string;
  state: string;
  draft: boolean;
  merged: boolean;
  author: string;
  viewerLogin: string; // the connected user's login — to show edit/delete only on own comments
  baseBranch: string;
  headBranch: string;
  headRepo: string; // head repository owner/name — where suggestions commit (may be a fork)
  headOid: string; // head commit sha — the commit_id when posting review comments
  reviewDecision: string | null;
  checksStatus: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  bodyHtml: string; // sanitized; empty string when the PR has no description
  createdAt: string; // ISO
  updatedAt: string; // ISO
  comments: PullRequestComment[];
  reviews: PullRequestReview[];
  reviewThreads: ReviewThread[];
  // Timeline (getPullRequestTimeline) and diff files (getPullRequestFiles) are fetched lazily
  // per-tab — not in the initial detail load, so the modal opens on the core data alone.
}

export interface PullRequestView {
  id: string;
  nodeId: string | null;
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
