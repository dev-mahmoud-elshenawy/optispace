import "server-only";

import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";

import { db } from "@/lib/db";
import { sanitizeHtml } from "@/features/integrations/azure-devops/service";

import type { DiffFile, DiffLine, PrCommit, PullRequestDetail, TimelineItem } from "./types";

// The GitHub token comes ONLY from the OAuth device-flow connection (DB, single-row
// GithubAuth). No .env, no PAT. Not connected → null → the sync no-ops.
export async function resolveGithubToken(): Promise<string | null> {
  const row = await db.githubAuth.findUnique({ where: { id: "singleton" } });
  return row?.accessToken ?? null;
}

// Configured = an OAuth token exists (connected in Settings).
export async function isGithubConfigured(): Promise<boolean> {
  return (await resolveGithubToken()) !== null;
}

// Why this PR is in the result set — all are personally relevant (yours), so all can notify.
export type PullRequestRelation = "author" | "reviewer" | "assignee";

// Normalized PR the sync/UI consume — flattened from the GraphQL shape.
export interface PullRequestDTO {
  nodeId: string; // GitHub GraphQL global node ID — used to fetch detail without name resolution
  repo: string; // "owner/repo"
  number: number;
  title: string;
  url: string;
  state: string; // open | merged | closed
  draft: boolean;
  author: string;
  reviewDecision: string | null; // APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null
  checksStatus: string | null; // SUCCESS | FAILURE | PENDING | ERROR | EXPECTED | null
  headBranch: string;
  baseBranch: string;
  updatedAtRemote: string; // ISO — GitHub's updatedAt
  relation: PullRequestRelation;
}

// One GraphQL query returns PRs + reviewDecision + CI rollup together — the whole
// reason we use GraphQL over REST search (which needs an extra call per PR for those).
const SEARCH_QUERY = `
  query ($q: String!, $limit: Int!) {
    search(query: $q, type: ISSUE, first: $limit) {
      nodes {
        ... on PullRequest {
          id
          number
          title
          url
          state
          isDraft
          updatedAt
          author { login }
          headRefName
          baseRefName
          reviewDecision
          repository { nameWithOwner }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup { state }
              }
            }
          }
        }
      }
    }
  }
`;

const SEARCH_LIMIT = 100; // GraphQL search max per page

interface SearchNode {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  updatedAt: string;
  author: { login: string } | null;
  headRefName: string;
  baseRefName: string;
  reviewDecision: string | null;
  repository: { nameWithOwner: string };
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
}

// Strongest relation wins when a PR matches several queries.
const RELATION_RANK: Record<PullRequestRelation, number> = { author: 1, assignee: 2, reviewer: 3 };

// Every open PR you're involved in — authored, review-requested, or assigned — across
// all repos the OAuth token can see. No repo/org scoping (that used to come from .env,
// now gone): the token's own visibility is the scope. `review-requested:@me` drops a PR
// once you submit a review (GitHub clears you from the requested set) — a known limit.
export async function fetchMyPullRequests(token: string): Promise<PullRequestDTO[]> {
  const client = graphql.defaults({ headers: { authorization: `token ${token}` } });
  const queries: { q: string; relation: PullRequestRelation }[] = [
    { q: "is:pr is:open author:@me", relation: "author" },
    { q: "is:pr is:open review-requested:@me", relation: "reviewer" },
    // reviewed-by:@me keeps a PR in the set AFTER you review/comment — GitHub clears you from
    // review-requested the moment you act, which otherwise pruned the PR you're reviewing.
    { q: "is:pr is:open reviewed-by:@me", relation: "reviewer" },
    { q: "is:pr is:open assignee:@me", relation: "assignee" },
  ];

  const seen = new Map<string, PullRequestDTO>();
  for (const { q, relation } of queries) {
    const res = await client<{ search: { nodes: (SearchNode | Record<string, never>)[] } }>(SEARCH_QUERY, {
      q,
      limit: SEARCH_LIMIT,
    });
    for (const node of res.search.nodes) {
      if (!("number" in node) || !node.repository) continue;
      const pr = toDto(node as SearchNode, relation);
      const key = `${pr.repo}#${pr.number}`;
      const prev = seen.get(key);
      // Keep the strongest relation if this PR already matched another query.
      if (prev && RELATION_RANK[prev.relation] >= RELATION_RANK[relation]) continue;
      seen.set(key, prev ? { ...prev, relation } : pr);
    }
  }
  return [...seen.values()];
}

function toDto(node: SearchNode, relation: PullRequestRelation): PullRequestDTO {
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;
  return {
    nodeId: node.id,
    repo: node.repository.nameWithOwner,
    number: node.number,
    title: node.title,
    url: node.url,
    state: node.state.toLowerCase(),
    draft: node.isDraft,
    author: node.author?.login ?? "unknown",
    reviewDecision: node.reviewDecision,
    checksStatus: rollup,
    headBranch: node.headRefName,
    baseBranch: node.baseRefName,
    updatedAtRemote: node.updatedAt,
    relation,
  };
}

// Full detail for one PR — powers the in-app modal so clicking a PR never leaves the app.
// GitHub returns `bodyHTML` (server-rendered markdown); we still sanitize it on our side
// (shared ADO allowlist) before it reaches the client.
const PR_DETAIL_FIELDS = `
  number
  title
  url
  state
  isDraft
  merged
  bodyHTML
  additions
  deletions
  changedFiles
  createdAt
  updatedAt
  headRefOid
  author { login }
  baseRefName
  headRefName
  reviewDecision
  repository { nameWithOwner }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  comments(last: 100) { nodes { databaseId author { login } bodyHTML body createdAt } }
  reviews(last: 50) { nodes { author { login } state bodyHTML createdAt } }
  reviewThreads(first: 100) {
    nodes {
      id isResolved isOutdated line diffSide path
      comments(first: 50) { nodes { id databaseId author { login } bodyHTML body createdAt } }
    }
  }
`;

// Timeline lives in its own query (lazy — its own tab) so the initial detail query stays lean.
const TIMELINE_FIELDS = `
  timelineItems(first: 100, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_COMMIT, MERGED_EVENT, CLOSED_EVENT, REOPENED_EVENT, REVIEW_REQUESTED_EVENT, HEAD_REF_FORCE_PUSHED_EVENT, LABELED_EVENT, ASSIGNED_EVENT]) {
    nodes {
      __typename
      ... on IssueComment { author { login } bodyHTML createdAt }
      ... on PullRequestReview { author { login } state bodyHTML createdAt }
      ... on PullRequestCommit { commit { message committedDate abbreviatedOid } }
      ... on MergedEvent { actor { login } createdAt }
      ... on ClosedEvent { actor { login } createdAt }
      ... on ReopenedEvent { actor { login } createdAt }
      ... on ReviewRequestedEvent { actor { login } createdAt requestedReviewer { ... on User { login } } }
      ... on HeadRefForcePushedEvent { actor { login } createdAt }
      ... on LabeledEvent { actor { login } createdAt label { name } }
      ... on AssignedEvent { actor { login } createdAt assignee { ... on User { login } } }
    }
  }
`;
const TIMELINE_NODE_QUERY = `query ($id: ID!) { node(id: $id) { ... on PullRequest { ${TIMELINE_FIELDS} } } }`;
const TIMELINE_REPO_QUERY = `query ($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { ${TIMELINE_FIELDS} } } }`;

// Primary: fetch by the PR's global node ID (what search already resolved) — immune to repo
// renames and the "Could not resolve to a Repository" name-lookup failures.
const NODE_DETAIL_QUERY = `query ($id: ID!) { viewer { login } node(id: $id) { ... on PullRequest { ${PR_DETAIL_FIELDS} } } }`;
// Fallback for rows synced before nodeId existed: resolve by owner/name/number.
const REPO_DETAIL_QUERY = `query ($owner: String!, $name: String!, $number: Int!) { viewer { login } repository(owner: $owner, name: $name) { pullRequest(number: $number) { ${PR_DETAIL_FIELDS} } } }`;

interface ThreadNode {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  line: number | null;
  diffSide: string;
  path: string;
  comments: {
    nodes: { id: string; databaseId: number | null; author: { login: string } | null; bodyHTML: string; body: string; createdAt: string }[];
  };
}

interface TimelineNode {
  __typename: string;
  author?: { login: string } | null;
  actor?: { login: string } | null;
  bodyHTML?: string;
  state?: string;
  createdAt?: string;
  commit?: { message: string; committedDate: string; abbreviatedOid?: string };
  label?: { name: string };
  requestedReviewer?: { login?: string } | null;
  assignee?: { login?: string } | null;
}

interface DetailNode {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  merged: boolean;
  bodyHTML: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  headRefOid: string;
  author: { login: string } | null;
  baseRefName: string;
  headRefName: string;
  reviewDecision: string | null;
  repository: { nameWithOwner: string } | null;
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
  comments: { nodes: { databaseId: number | null; author: { login: string } | null; bodyHTML: string; body: string; createdAt: string }[] };
  reviews: { nodes: { author: { login: string } | null; state: string; bodyHTML: string; createdAt: string }[] };
  reviewThreads: { nodes: ThreadNode[] };
}

interface TimelinePrNode {
  timelineItems: { nodes: TimelineNode[] };
}

export async function fetchPullRequestDetail(
  token: string,
  nodeId: string | null,
  repo: string,
  number: number,
): Promise<PullRequestDetail | null> {
  const client = graphql.defaults({ headers: { authorization: `token ${token}` } });

  // Primary: by global node ID — no repo-name resolution, so it can't hit "Could not resolve".
  if (nodeId) {
    const res = await client<{ viewer: { login: string }; node: DetailNode | null }>(NODE_DETAIL_QUERY, { id: nodeId });
    if (res.node) return mapDetail(res.node, res.node.repository?.nameWithOwner ?? repo, res.viewer.login);
  }

  // Fallback (rows synced before nodeId existed): resolve by owner/name/number. Guarded so a
  // name-resolution failure surfaces as "not found" instead of a raw GraphQL error string.
  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;
  try {
    const res = await client<{ viewer: { login: string }; repository: { pullRequest: DetailNode | null } | null }>(
      REPO_DETAIL_QUERY,
      { owner, name, number },
    );
    const pr = res.repository?.pullRequest;
    return pr ? mapDetail(pr, pr.repository?.nameWithOwner ?? repo, res.viewer.login) : null;
  } catch (error) {
    // A NOT_FOUND on the repo (not the PR) means the token can't see it at all — usually the
    // OAuth app isn't authorized for that org (or SAML SSO not granted). Surface that instead
    // of a generic "not found" so the user knows to authorize the app + re-sync in Settings.
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Could not resolve to a Repository")) {
      throw new Error(`No access to ${repo}. Authorize the GitHub OAuth app for this organization, then Sync.`);
    }
    return null;
  }
}

function mapDetail(pr: DetailNode, repo: string, viewerLogin: string): PullRequestDetail {
  return {
    repo,
    viewerLogin,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state.toLowerCase(),
    draft: pr.isDraft,
    merged: pr.merged,
    author: pr.author?.login ?? "unknown",
    baseBranch: pr.baseRefName,
    headBranch: pr.headRefName,
    headOid: pr.headRefOid,
    reviewDecision: pr.reviewDecision,
    checksStatus: pr.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    bodyHtml: pr.bodyHTML ? sanitizeHtml(pr.bodyHTML) : "",
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    comments: pr.comments.nodes.map((c) => ({
      databaseId: c.databaseId,
      author: c.author?.login ?? "unknown",
      bodyHtml: sanitizeHtml(c.bodyHTML),
      body: c.body,
      createdAt: c.createdAt,
    })),
    reviews: pr.reviews.nodes
      // GitHub emits an empty COMMENTED review for every inline-comment batch; drop the
      // body-less noise so the modal shows only reviews that actually said something.
      .filter((r) => r.bodyHTML.trim() !== "" || r.state !== "COMMENTED")
      .map((r) => ({
        author: r.author?.login ?? "unknown",
        state: r.state,
        bodyHtml: sanitizeHtml(r.bodyHTML),
        createdAt: r.createdAt,
      })),
    reviewThreads: pr.reviewThreads.nodes.map((t) => ({
      id: t.id,
      path: t.path,
      line: t.line,
      diffSide: t.diffSide,
      isResolved: t.isResolved,
      isOutdated: t.isOutdated,
      comments: t.comments.nodes.map((c) => ({
        id: c.id,
        databaseId: c.databaseId,
        author: c.author?.login ?? "unknown",
        bodyHtml: sanitizeHtml(c.bodyHTML),
        body: c.body,
        createdAt: c.createdAt,
      })),
    })),
  };
}

// Lazy timeline for the Timeline tab (its own query, nodeId-primary like the detail fetch).
export async function fetchPullRequestTimeline(
  token: string,
  nodeId: string | null,
  repo: string,
  number: number,
): Promise<TimelineItem[]> {
  const client = graphql.defaults({ headers: { authorization: `token ${token}` } });
  const toItems = (n: TimelinePrNode | null | undefined) =>
    (n?.timelineItems.nodes ?? []).map(mapTimeline).filter((t): t is TimelineItem => t !== null);
  if (nodeId) {
    const res = await client<{ node: TimelinePrNode | null }>(TIMELINE_NODE_QUERY, { id: nodeId });
    if (res.node) return toItems(res.node);
  }
  const [owner, name] = repo.split("/");
  if (!owner || !name) return [];
  try {
    const res = await client<{ repository: { pullRequest: TimelinePrNode | null } | null }>(TIMELINE_REPO_QUERY, {
      owner,
      name,
      number,
    });
    return toItems(res.repository?.pullRequest);
  } catch {
    return [];
  }
}

function mapTimeline(n: TimelineNode): TimelineItem | null {
  const actor = n.actor?.login ?? n.author?.login ?? "someone";
  const createdAt = n.createdAt ?? n.commit?.committedDate ?? "";
  switch (n.__typename) {
    case "IssueComment":
      return { kind: "comment", actor, createdAt, title: "commented", bodyHtml: sanitizeHtml(n.bodyHTML ?? "") };
    case "PullRequestReview": {
      const state = n.state ?? "";
      // Skip the empty COMMENTED review GitHub emits for each inline-comment batch.
      if (state === "COMMENTED" && !(n.bodyHTML ?? "").trim()) return null;
      return {
        kind: "review",
        actor,
        createdAt,
        title: `reviewed — ${state.toLowerCase().replace(/_/g, " ")}`,
        bodyHtml: sanitizeHtml(n.bodyHTML ?? ""),
        state,
      };
    }
    case "PullRequestCommit":
      return {
        kind: "commit",
        actor,
        createdAt,
        title: (n.commit?.message ?? "").split("\n")[0] || "committed",
        sha: n.commit?.abbreviatedOid,
      };
    case "MergedEvent":
      return { kind: "merged", actor, createdAt, title: "merged the pull request" };
    case "ClosedEvent":
      return { kind: "closed", actor, createdAt, title: "closed the pull request" };
    case "ReopenedEvent":
      return { kind: "reopened", actor, createdAt, title: "reopened the pull request" };
    case "ReviewRequestedEvent":
      return { kind: "review_requested", actor, createdAt, title: `requested a review from ${n.requestedReviewer?.login ?? "someone"}` };
    case "HeadRefForcePushedEvent":
      return { kind: "pushed", actor, createdAt, title: "force-pushed the branch" };
    case "LabeledEvent":
      return { kind: "labeled", actor, createdAt, title: `added the "${n.label?.name ?? ""}" label` };
    case "AssignedEvent":
      return { kind: "assigned", actor, createdAt, title: `assigned ${n.assignee?.login ?? "someone"}` };
    default:
      return null;
  }
}

// ── REST via official Octokit SDK ────────────────────────────────────────────
// Diff patches + write-back (comments/reviews) aren't in the GraphQL detail query, so we
// use @octokit/rest. Prefer the SDK over raw fetch (see prefer-official-packages).
function rest(token: string): Octokit {
  return new Octokit({ auth: token });
}

function splitRepo(repo: string): { owner: string; name: string } | null {
  const [owner, name] = repo.split("/");
  return owner && name ? { owner, name } : null;
}

const MAX_DIFF_FILES = 300; // cap files rendered per PR
const MAX_PATCH_LINES = 1500; // cap lines per file — giant generated diffs would choke the modal

// Lazy diff fetch for the Code tab — deliberately NOT part of the initial detail load, so the
// modal opens on the GraphQL data alone (~1s) instead of also waiting on the diff (~0.5s+).
export async function fetchPullRequestFiles(token: string, repo: string, number: number): Promise<DiffFile[]> {
  const parts = splitRepo(repo);
  if (!parts) return [];
  const octo = rest(token);
  const files = await octo.paginate(octo.pulls.listFiles, {
    owner: parts.owner,
    repo: parts.name,
    pull_number: number,
    per_page: 100,
  });
  return mapDiffFiles(files);
}

// listFiles and getCommit both hand back this shape — one mapper for the full-PR diff and the
// single-commit diff (commit picker).
type RestFile = { filename: string; status: string; additions: number; deletions: number; patch?: string };

function mapDiffFiles(files: RestFile[]): DiffFile[] {
  return files.slice(0, MAX_DIFF_FILES).map((f) => ({
    path: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    binary: !f.patch,
    lines: f.patch ? parsePatch(f.patch) : [],
  }));
}

// Commits in the PR, oldest → newest (like GitHub's picker), for filtering the diff by commit.
export async function fetchPullRequestCommits(token: string, repo: string, number: number): Promise<PrCommit[]> {
  const parts = splitRepo(repo);
  if (!parts) return [];
  const octo = rest(token);
  const commits = await octo.paginate(octo.pulls.listCommits, {
    owner: parts.owner,
    repo: parts.name,
    pull_number: number,
    per_page: 100,
  });
  return commits.map((c) => {
    const full = c.commit.message ?? "";
    const nl = full.indexOf("\n");
    return {
      sha: c.sha,
      abbreviatedOid: c.sha.slice(0, 7),
      parentSha: c.parents[0]?.sha ?? "",
      message: (nl === -1 ? full : full.slice(0, nl)).trim() || "(no message)",
      body: (nl === -1 ? "" : full.slice(nl + 1)).trim(),
      author: c.author?.login ?? c.commit.author?.name ?? "unknown",
      date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
    };
  });
}

// Diff for a single commit inside the PR — the commit picker's "view this commit's changes".
export async function fetchCommitFiles(token: string, repo: string, sha: string): Promise<DiffFile[]> {
  const parts = splitRepo(repo);
  if (!parts) return [];
  const res = await rest(token).repos.getCommit({ owner: parts.owner, repo: parts.name, ref: sha });
  return mapDiffFiles(res.data.files ?? []);
}

// Combined diff for a range of commits (base..head) — the multi-select commit picker. `base` is the
// first-parent of the earliest selected commit, `head` is the latest selected commit.
export async function fetchCommitRangeFiles(
  token: string,
  repo: string,
  base: string,
  head: string,
): Promise<DiffFile[]> {
  const parts = splitRepo(repo);
  if (!parts) return [];
  const res = await rest(token).repos.compareCommitsWithBasehead({
    owner: parts.owner,
    repo: parts.name,
    basehead: `${base}...${head}`,
  });
  return mapDiffFiles(res.data.files ?? []);
}

// Parse a unified-diff patch into typed lines with old/new line numbers for the gutter.
function parsePatch(patch: string): DiffLine[] {
  const out: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    if (out.length >= MAX_PATCH_LINES) break;
    if (raw.startsWith("@@")) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      out.push({ type: "hunk", content: raw, oldLine: null, newLine: null });
      continue;
    }
    const marker = raw[0];
    const content = raw.slice(1);
    if (marker === "+") {
      out.push({ type: "add", content, oldLine: null, newLine });
      newLine++;
    } else if (marker === "-") {
      out.push({ type: "del", content, oldLine, newLine: null });
      oldLine++;
    } else if (marker === "\\") {
      continue; // "\ No newline at end of file"
    } else {
      out.push({ type: "context", content, oldLine, newLine });
      oldLine++;
      newLine++;
    }
  }
  return out;
}

// A general PR (issue) comment.
export async function createIssueComment(token: string, repo: string, number: number, body: string): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).issues.createComment({ owner: p.owner, repo: p.name, issue_number: number, body });
}

// A new inline review comment on a diff line (starts a thread).
export async function createReviewComment(
  token: string,
  repo: string,
  number: number,
  commitId: string,
  path: string,
  line: number,
  side: "LEFT" | "RIGHT",
  body: string,
  startLine?: number | null,
): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  // Multi-line range: GitHub wants start_line/start_side + line/side (start must precede line).
  const range = startLine != null && startLine < line ? { start_line: startLine, start_side: side } : {};
  await rest(token).pulls.createReviewComment({
    owner: p.owner,
    repo: p.name,
    pull_number: number,
    commit_id: commitId,
    path,
    line,
    side,
    body,
    ...range,
  });
}

// A file-level review comment (whole file, not a specific line) — subject_type "file".
export async function createFileComment(
  token: string,
  repo: string,
  number: number,
  commitId: string,
  path: string,
  body: string,
): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).pulls.createReviewComment({
    owner: p.owner,
    repo: p.name,
    pull_number: number,
    commit_id: commitId,
    path,
    body,
    subject_type: "file",
  });
}

// Edit / delete an issue comment (general PR comment) by its REST id.
export async function updateIssueComment(token: string, repo: string, commentId: number, body: string): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).issues.updateComment({ owner: p.owner, repo: p.name, comment_id: commentId, body });
}

export async function deleteIssueComment(token: string, repo: string, commentId: number): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).issues.deleteComment({ owner: p.owner, repo: p.name, comment_id: commentId });
}

// Edit / delete an inline review comment by its REST id.
export async function updateReviewCommentById(token: string, repo: string, commentId: number, body: string): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).pulls.updateReviewComment({ owner: p.owner, repo: p.name, comment_id: commentId, body });
}

export async function deleteReviewCommentById(token: string, repo: string, commentId: number): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).pulls.deleteReviewComment({ owner: p.owner, repo: p.name, comment_id: commentId });
}

// Reply to an existing review thread (by the thread's last comment REST id).
export async function replyReviewComment(token: string, repo: string, number: number, commentId: number, body: string): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).pulls.createReplyForReviewComment({ owner: p.owner, repo: p.name, pull_number: number, comment_id: commentId, body });
}

// Submit a review verdict: APPROVE / REQUEST_CHANGES / COMMENT (+ optional summary body).
export async function submitReview(
  token: string,
  repo: string,
  number: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body: string,
): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).pulls.createReview({ owner: p.owner, repo: p.name, pull_number: number, event, body: body || undefined });
}

// Resolve / unresolve a review thread (GraphQL — no REST equivalent).
export async function setThreadResolved(token: string, threadId: string, resolved: boolean): Promise<void> {
  const client = graphql.defaults({ headers: { authorization: `token ${token}` } });
  const mutation = resolved
    ? `mutation ($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id } } }`
    : `mutation ($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { thread { id } } }`;
  await client(mutation, { id: threadId });
}

// Merge the PR (merge | squash | rebase).
export async function mergePullRequest(token: string, repo: string, number: number, method: "merge" | "squash" | "rebase"): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).pulls.merge({ owner: p.owner, repo: p.name, pull_number: number, merge_method: method });
}

// Close the PR without merging.
export async function closePullRequest(token: string, repo: string, number: number): Promise<void> {
  const p = splitRepo(repo);
  if (!p) throw new Error("Invalid repository.");
  await rest(token).pulls.update({ owner: p.owner, repo: p.name, pull_number: number, state: "closed" });
}
