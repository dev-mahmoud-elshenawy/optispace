"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { recordNotifications } from "@/features/notifications/actions";
import type { NotificationEvent } from "@/features/notifications/service";

import {
  applySuggestion,
  closePullRequest,
  createFileComment,
  createIssueComment,
  createReviewComment,
  deleteIssueComment,
  fetchMentionableUsers,
  deleteReviewCommentById,
  fetchCommitFiles,
  fetchCommitRangeFiles,
  fetchMyPullRequests,
  fetchPullRequestCommits,
  fetchPullRequestDetail,
  fetchPullRequestFiles,
  fetchPullRequestTimeline,
  mergePullRequest,
  replyReviewComment,
  resolveGithubToken,
  setPullRequestDraft,
  setThreadResolved,
  submitReview,
  submitReviewWithComments,
  toggleReaction,
  updateIssueComment,
  updateReviewCommentById,
  type PullRequestDTO,
} from "./service";
import type { DiffFile, PendingReviewComment, PrCommit, PullRequestDetail, TimelineItem } from "./types";

export type GithubSyncResult =
  | { ok: true; upserted: number; pruned: number; notified: number }
  | { ok: false; error: string };

// A stable per-PR key for notifications and the local externalId.
function prKey(pr: { repo: string; number: number }): string {
  return `${pr.repo}#${pr.number}`;
}

// The fields whose change is worth a notification — deliberately NOT updatedAtRemote
// (GitHub bumps that on every comment/label/push, which would spam). Same lesson as
// the ADO status-change work: diff the meaningful signal, not "something touched it".
function statusSignature(pr: { state: string; reviewDecision: string | null; checksStatus: string | null }): string {
  return `${pr.state}|${pr.reviewDecision ?? ""}|${pr.checksStatus ?? ""}`;
}

// Sync every open PR you're involved in into the local cache. Upserts by (repo, number);
// soft-deletes rows that left the result set. Runs from the background poller — no-ops
// gracefully until GitHub is connected in Settings.
// Record sync health on the GithubAuth singleton (shown in Settings). updateMany no-ops when the
// row is absent (not connected), so the "not connected" early-return never writes anything.
async function recordGithubHealth(error: string | null): Promise<void> {
  await db.githubAuth.updateMany({
    where: { id: "singleton" },
    data: error === null ? { lastSyncedAt: new Date(), lastError: null } : { lastError: error },
  });
}

export async function syncGithubPullRequests(): Promise<GithubSyncResult> {
  const result = await runGithubSync();
  await recordGithubHealth(result.ok ? null : result.error);
  return result;
}

async function runGithubSync(): Promise<GithubSyncResult> {
  const token = await resolveGithubToken();
  if (!token) return { ok: false, error: "GitHub is not connected. Connect it in Settings." };

  let prs: PullRequestDTO[];
  try {
    prs = await fetchMyPullRequests(token);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "GitHub sync failed." };
  }

  const events: NotificationEvent[] = [];
  let upserted = 0;

  for (const pr of prs) {
    const existing = await db.githubPullRequest.findUnique({
      where: { repo_number: { repo: pr.repo, number: pr.number } },
      select: { id: true, state: true, reviewDecision: true, checksStatus: true, deletedAt: true },
    });

    const data = {
      nodeId: pr.nodeId,
      title: pr.title,
      url: pr.url,
      state: pr.state,
      draft: pr.draft,
      author: pr.author,
      reviewDecision: pr.reviewDecision,
      checksStatus: pr.checksStatus,
      headBranch: pr.headBranch,
      baseBranch: pr.baseBranch,
      updatedAtRemote: new Date(pr.updatedAtRemote),
    };

    if (existing) {
      await db.githubPullRequest.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } });
      // Notify on a real status/review/checks change — but not on a restore (a PR that
      // was pruned then reappeared): "old" was overwritten, so we can't trust the diff.
      const wasActive = existing.deletedAt == null;
      if (wasActive && statusSignature(existing) !== statusSignature(pr)) {
        events.push(prNotification(pr, "pr_status_changed", `Updated: ${prStatusLabel(pr)}`));
      }
    } else {
      await db.githubPullRequest.create({ data: { ...data, repo: pr.repo, number: pr.number } });
      // A brand-new PR you're asked to review = a review request.
      if (pr.relation === "reviewer") {
        events.push(prNotification(pr, "pr_review_requested", "Requested your review"));
      }
    }
    upserted += 1;
  }

  // Prune: locally-active PRs no longer in the open @me result set (merged, closed, or
  // you're off the reviewer list). Fail-safe: an empty fetch is inconclusive
  // (transient/token hiccup) — skip pruning rather than wipe the whole cache.
  let pruned = 0;
  if (prs.length > 0) {
    const liveKeys = new Set(prs.map(prKey));
    const active = await db.githubPullRequest.findMany({
      where: { deletedAt: null },
      select: { id: true, repo: true, number: true },
    });
    const stale = active.filter((row) => !liveKeys.has(prKey(row))).map((row) => row.id);
    if (stale.length > 0) {
      await db.githubPullRequest.updateMany({ where: { id: { in: stale } }, data: { deletedAt: new Date() } });
      pruned = stale.length;
    }
  }

  let notified = 0;
  if (events.length > 0) {
    notified = await recordNotifications(events);
    if (notified > 0) revalidatePath("/notifications");
  }
  if (upserted > 0 || pruned > 0) {
    revalidatePath("/pull-requests");
    revalidatePath("/");
  }
  return { ok: true, upserted, pruned, notified };
}

function prStatusLabel(pr: PullRequestDTO): string {
  const parts = [pr.state];
  if (pr.reviewDecision) parts.push(pr.reviewDecision.toLowerCase().replace(/_/g, " "));
  if (pr.checksStatus) parts.push(`checks ${pr.checksStatus.toLowerCase()}`);
  return parts.join(" · ");
}

function prNotification(
  pr: PullRequestDTO,
  type: "pr_review_requested" | "pr_status_changed",
  message: string,
): NotificationEvent {
  const dedupe =
    type === "pr_review_requested" ? `pr_review:${prKey(pr)}` : `pr_status:${prKey(pr)}:${statusSignature(pr)}`;
  return {
    type,
    externalId: prKey(pr),
    title: `#${pr.number} ${pr.title}`,
    url: pr.url,
    message,
    project: pr.repo,
    actor: pr.author,
    occurredAt: pr.updatedAtRemote,
    dedupeKey: dedupe,
  };
}

// ── PR detail (in-app modal) ─────────────────────────────────
// Live-fetched when a PR is opened so clicking a PR stays inside the app instead of
// navigating to github.com.
export type GetPullRequestDetailResult =
  | { ok: true; detail: PullRequestDetail }
  | { ok: false; error: string };

export async function getPullRequestDetail(
  nodeId: string | null,
  repo: string,
  number: number,
): Promise<GetPullRequestDetailResult> {
  const token = await resolveGithubToken();
  if (!token) return { ok: false, error: "GitHub is not connected." };
  try {
    const detail = await fetchPullRequestDetail(token, nodeId, repo, number);
    if (!detail) return { ok: false, error: "Pull request not found." };
    return { ok: true, detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load pull request." };
  }
}

// Lazy timeline for the Timeline tab.
export type GetPullRequestTimelineResult = { ok: true; timeline: TimelineItem[] } | { ok: false; error: string };

export async function getPullRequestTimeline(
  nodeId: string | null,
  repo: string,
  number: number,
): Promise<GetPullRequestTimelineResult> {
  const token = await resolveGithubToken();
  if (!token) return { ok: false, error: "GitHub is not connected." };
  try {
    const timeline = await fetchPullRequestTimeline(token, nodeId, repo, number);
    return { ok: true, timeline };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load the timeline." };
  }
}

// Lazy diff for the Code tab — fetched on demand so the modal opens fast on Summary.
export type GetPullRequestFilesResult = { ok: true; files: DiffFile[] } | { ok: false; error: string };

export async function getPullRequestFiles(
  repo: string,
  number: number,
  sha?: string | null, // when set, return that single commit's diff instead of the whole PR
): Promise<GetPullRequestFilesResult> {
  const token = await resolveGithubToken();
  if (!token) return { ok: false, error: "GitHub is not connected." };
  try {
    const files = sha ? await fetchCommitFiles(token, repo, sha) : await fetchPullRequestFiles(token, repo, number);
    return { ok: true, files };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load the diff." };
  }
}

// Combined diff for a range of selected commits (base..head) — the multi-select commit picker.
export async function getCommitRangeFiles(
  repo: string,
  base: string,
  head: string,
): Promise<GetPullRequestFilesResult> {
  const token = await resolveGithubToken();
  if (!token) return { ok: false, error: "GitHub is not connected." };
  try {
    const files = await fetchCommitRangeFiles(token, repo, base, head);
    return { ok: true, files };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load the diff." };
  }
}

// Commits in the PR, for the Code-tab commit picker.
export type GetPullRequestCommitsResult = { ok: true; commits: PrCommit[] } | { ok: false; error: string };

export async function getPullRequestCommits(repo: string, number: number): Promise<GetPullRequestCommitsResult> {
  const token = await resolveGithubToken();
  if (!token) return { ok: false, error: "GitHub is not connected." };
  try {
    const commits = await fetchPullRequestCommits(token, repo, number);
    return { ok: true, commits };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load commits." };
  }
}

// ── PR review write-back (in-app code review) ────────────────
// All go through the connected token; the modal re-fetches detail after each to reflect the change.
export type PrWriteResult = { ok: true } | { ok: false; error: string };

async function withGithubToken(fn: (token: string) => Promise<void>): Promise<PrWriteResult> {
  const token = await resolveGithubToken();
  if (!token) return { ok: false, error: "GitHub is not connected." };
  try {
    await fn(token);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "GitHub request failed." };
  }
}

export async function addPrComment(repo: string, number: number, body: string): Promise<PrWriteResult> {
  if (!body.trim()) return { ok: false, error: "Comment is empty." };
  return withGithubToken((t) => createIssueComment(t, repo, number, body.trim()));
}

export async function addPrLineComment(
  repo: string,
  number: number,
  commitId: string,
  path: string,
  line: number,
  side: "LEFT" | "RIGHT",
  body: string,
  startLine?: number | null,
): Promise<PrWriteResult> {
  if (!body.trim()) return { ok: false, error: "Comment is empty." };
  return withGithubToken((t) => createReviewComment(t, repo, number, commitId, path, line, side, body.trim(), startLine));
}

export async function setPrThreadResolved(threadId: string, resolved: boolean): Promise<PrWriteResult> {
  return withGithubToken((t) => setThreadResolved(t, threadId, resolved));
}

// Add / remove a reaction on a comment (subjectId = its GraphQL node id).
export async function togglePrReaction(subjectId: string, content: string, add: boolean): Promise<PrWriteResult> {
  return withGithubToken((t) => toggleReaction(t, subjectId, content, add));
}

// Commit a suggested change to the PR's head branch (needs push access; forks → the fork repo).
export async function applyPrSuggestion(
  headRepo: string,
  branch: string,
  path: string,
  startLine: number,
  endLine: number,
  replacement: string,
): Promise<PrWriteResult> {
  return withGithubToken((t) => applySuggestion(t, headRepo, branch, path, startLine, endLine, replacement));
}

// Autocomplete source for @-mentions in the comment composers. Returns [] when not connected.
export async function searchPrMentionUsers(repo: string, query: string): Promise<{ login: string; name: string | null }[]> {
  const token = await resolveGithubToken();
  if (!token) return [];
  return fetchMentionableUsers(token, repo, query);
}

export async function mergePr(repo: string, number: number, method: "merge" | "squash" | "rebase"): Promise<PrWriteResult> {
  return withGithubToken((t) => mergePullRequest(t, repo, number, method));
}

// Convert a PR to draft (draft=true) or mark it ready for review (draft=false).
export async function setPrDraft(nodeId: string, draft: boolean): Promise<PrWriteResult> {
  return withGithubToken((t) => setPullRequestDraft(t, nodeId, draft));
}

export async function closePr(repo: string, number: number): Promise<PrWriteResult> {
  return withGithubToken((t) => closePullRequest(t, repo, number));
}

export async function addPrFileComment(
  repo: string,
  number: number,
  commitId: string,
  path: string,
  body: string,
): Promise<PrWriteResult> {
  if (!body.trim()) return { ok: false, error: "Comment is empty." };
  return withGithubToken((t) => createFileComment(t, repo, number, commitId, path, body.trim()));
}

export type CommentKind = "issue" | "review";

export async function editPrComment(repo: string, kind: CommentKind, commentId: number, body: string): Promise<PrWriteResult> {
  if (!body.trim()) return { ok: false, error: "Comment is empty." };
  return withGithubToken((t) =>
    kind === "issue" ? updateIssueComment(t, repo, commentId, body.trim()) : updateReviewCommentById(t, repo, commentId, body.trim()),
  );
}

export async function deletePrComment(repo: string, kind: CommentKind, commentId: number): Promise<PrWriteResult> {
  return withGithubToken((t) =>
    kind === "issue" ? deleteIssueComment(t, repo, commentId) : deleteReviewCommentById(t, repo, commentId),
  );
}

export async function replyPrThread(repo: string, number: number, commentId: number, body: string): Promise<PrWriteResult> {
  if (!body.trim()) return { ok: false, error: "Reply is empty." };
  return withGithubToken((t) => replyReviewComment(t, repo, number, commentId, body.trim()));
}

export async function submitPrReview(
  repo: string,
  number: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body: string,
): Promise<PrWriteResult> {
  // COMMENT with an empty body is a no-op on GitHub; require text for it.
  if (event === "COMMENT" && !body.trim()) return { ok: false, error: "Add a comment before submitting." };
  return withGithubToken((t) => submitReview(t, repo, number, event, body.trim()));
}

// Submit a review together with a batch of queued inline comments (the pending-review flow).
export async function submitPrReviewBatch(
  repo: string,
  number: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body: string,
  comments: PendingReviewComment[],
): Promise<PrWriteResult> {
  // A plain COMMENT review needs *something* — a body or at least one queued comment.
  if (event === "COMMENT" && !body.trim() && comments.length === 0) {
    return { ok: false, error: "Add a comment before submitting." };
  }
  return withGithubToken((t) =>
    submitReviewWithComments(
      t,
      repo,
      number,
      event,
      body.trim(),
      comments.map((c) => ({
        path: c.path,
        line: c.line,
        side: c.side,
        body: c.body,
        ...(c.startLine != null && c.startLine < c.line ? { start_line: c.startLine, start_side: c.side } : {}),
      })),
    ),
  );
}

// ── OAuth device flow ────────────────────────────────────────
// The ONLY way GitHub is connected — no PAT, no .env. You enter your OAuth App's Client ID
// once in Settings (device flow needs no client secret, so it isn't sensitive — it's kept
// on this device in localStorage, never in .env/DB) and click Connect: GitHub shows a code,
// you approve it at github.com/login/device, we poll for the token and store it in the
// single-row GithubAuth table. After that first entry it's click-Connect-only.
const GITHUB_SCOPES = "repo read:org"; // repo = private PRs/checks; read:org = org-wide PRs

export type GithubDeviceStartResult =
  | { ok: true; userCode: string; verificationUri: string; deviceCode: string; interval: number; expiresIn: number }
  | { ok: false; error: string };

export async function githubDeviceStart(clientId: string): Promise<GithubDeviceStartResult> {
  const id = clientId.trim();
  if (!id) return { ok: false, error: "Enter your GitHub OAuth App Client ID first." };
  try {
    const res = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: id, scope: GITHUB_SCOPES }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: data.error_description || "Failed to start GitHub device flow." };
    }
    return {
      ok: true,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      deviceCode: data.device_code,
      interval: data.interval ?? 5,
      expiresIn: data.expires_in ?? 900,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to start GitHub device flow." };
  }
}

export type GithubDevicePollResult =
  | { ok: true; login: string }
  | { ok: false; pending: boolean; error: string }; // pending → keep polling; else terminal

export async function githubDevicePoll(deviceCode: string, clientId: string): Promise<GithubDevicePollResult> {
  const id = clientId.trim();
  if (!id) return { ok: false, pending: false, error: "Missing Client ID." };
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: id,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const data = await res.json();
    if (data.error) {
      // authorization_pending / slow_down = user hasn't finished; anything else is terminal.
      const pending = data.error === "authorization_pending" || data.error === "slow_down";
      return { ok: false, pending, error: data.error_description || data.error };
    }
    const token = data.access_token as string;
    const scope = (data.scope as string) || null;
    const login = await fetchViewerLogin(token);
    await db.githubAuth.upsert({
      where: { id: "singleton" },
      update: { accessToken: token, scope, login },
      create: { id: "singleton", accessToken: token, scope, login },
    });
    revalidatePath("/pull-requests");
    revalidatePath("/settings");
    return { ok: true, login: login ?? "" };
  } catch (error) {
    return { ok: false, pending: false, error: error instanceof Error ? error.message : "GitHub device poll failed." };
  }
}

// Connect by pasting an existing token (GitHub CLI's `gh auth token`, or a classic PAT)
// instead of the OAuth device flow. This is the escape hatch when the org restricts
// third-party OAuth apps: the custom Optispace app stays invisible until an org owner
// approves it, but a token from an already-approved app (like GitHub CLI) can see the
// org's PRs right now. We validate by resolving the viewer login, then store it in the
// same single-row GithubAuth table the device flow uses — everything downstream is identical.
export type GithubConnectTokenResult = { ok: true; login: string } | { ok: false; error: string };

export async function githubConnectToken(token: string): Promise<GithubConnectTokenResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Paste a GitHub token first." };
  const login = await fetchViewerLogin(trimmed);
  if (!login) return { ok: false, error: "GitHub rejected that token (invalid, expired, or missing 'repo' scope)." };
  await db.githubAuth.upsert({
    where: { id: "singleton" },
    update: { accessToken: trimmed, scope: null, login },
    create: { id: "singleton", accessToken: trimmed, scope: null, login },
  });
  revalidatePath("/pull-requests");
  revalidatePath("/settings");
  return { ok: true, login };
}

export async function githubDisconnect(): Promise<{ ok: true }> {
  await db.githubAuth.deleteMany({ where: { id: "singleton" } });
  // Clear the cached PRs too — without a token the sync can't prune them, and leaving
  // them on the dashboard/list after disconnecting is confusing. Reconnecting re-syncs.
  await db.githubPullRequest.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } });
  revalidatePath("/pull-requests");
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export interface GithubAuthStatus {
  connected: boolean; // OAuth token row present — the only way GitHub is connected
  login: string | null; // authenticated GitHub login
}

export async function getGithubAuthStatus(): Promise<GithubAuthStatus> {
  const row = await db.githubAuth.findUnique({ where: { id: "singleton" } });
  return { connected: row != null, login: row?.login ?? null };
}

// The login the token belongs to — cosmetic (shown in Settings). Best-effort: a lookup
// failure must not fail an otherwise-valid connection, so it returns null rather than throw.
async function fetchViewerLogin(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.login === "string" ? data.login : null;
  } catch {
    return null;
  }
}
