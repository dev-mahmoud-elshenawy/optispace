import "server-only";

import { db } from "@/lib/db";

import type { PullRequestView } from "./types";

export async function listPullRequests(): Promise<PullRequestView[]> {
  const rows = await db.githubPullRequest.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAtRemote: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    repo: r.repo,
    number: r.number,
    title: r.title,
    url: r.url,
    state: r.state,
    draft: r.draft,
    author: r.author,
    reviewDecision: r.reviewDecision,
    checksStatus: r.checksStatus,
    headBranch: r.headBranch,
    baseBranch: r.baseBranch,
    updatedAtRemote: r.updatedAtRemote,
  }));
}

export async function countOpenPullRequests(): Promise<number> {
  return db.githubPullRequest.count({ where: { deletedAt: null } });
}
