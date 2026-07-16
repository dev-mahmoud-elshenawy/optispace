"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { recordNotifications } from "@/features/notifications/actions";
import type { NotificationEvent } from "@/features/notifications/service";

import { fetchMyPullRequests, getGithubConfig, type PullRequestDTO } from "./service";

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

// Sync open PRs (authored by me or review-requested to me) into the local cache.
// Upserts by (repo, number); soft-deletes rows that left the result set. Runs from
// the background poller — no-ops gracefully when GITHUB_TOKEN is unset.
export async function syncGithubPullRequests(): Promise<GithubSyncResult> {
  const config = getGithubConfig();
  if (!config) return { ok: false, error: "GitHub is not configured. Set GITHUB_TOKEN in .env." };

  let fetched;
  try {
    fetched = await fetchMyPullRequests(config);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "GitHub sync failed." };
  }
  const { prs } = fetched;

  const events: NotificationEvent[] = [];
  let upserted = 0;

  for (const pr of prs) {
    const existing = await db.githubPullRequest.findUnique({
      where: { repo_number: { repo: pr.repo, number: pr.number } },
      select: { id: true, state: true, reviewDecision: true, checksStatus: true, deletedAt: true },
    });

    const data = {
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
      // Only notify for PRs personally relevant to you (authored / review-requested),
      // never for org-only PRs (someone else's work — list-only, would be spam).
      const wasActive = existing.deletedAt == null;
      const mine = pr.relation === "author" || pr.relation === "reviewer" || pr.relation === "assignee";
      if (mine && wasActive && statusSignature(existing) !== statusSignature(pr)) {
        events.push(prNotification(pr, "pr_status_changed", `Updated: ${prStatusLabel(pr)}`));
      }
    } else {
      await db.githubPullRequest.create({ data: { ...data, repo: pr.repo, number: pr.number } });
      // A brand-new PR you're asked to review = a review request. Org-only and your
      // own authored PRs don't fire this.
      if (pr.relation === "reviewer") {
        events.push(prNotification(pr, "pr_review_requested", "Requested your review"));
      }
    }
    upserted += 1;
  }

  // Prune: locally-active PRs no longer in the open @me result set (merged, closed,
  // or you're off the reviewer list). Fail-safe: an empty fetch is inconclusive
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
