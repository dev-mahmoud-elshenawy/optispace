import "server-only";

import { graphql } from "@octokit/graphql";

export interface GithubConfig {
  token: string;
  allRepos: boolean; // GITHUB_REPOS="all" → every accessible repo
  repos: string[]; // explicit "owner/repo" list (ignored when allRepos)
  orgs: string[]; // GITHUB_ORGS — pull EVERY open PR in these orgs (team-wide view)
}

// Explicit opt-in: GITHUB_REPOS="all" syncs everything, a comma-separated list
// syncs those repos, and blank syncs nothing (no implicit "blank = all" magic).
// GITHUB_ORGS additionally pulls every open PR in the listed orgs (all authors) —
// those show in the list but never generate notifications (see the sync).
export function getGithubConfig(): GithubConfig | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return null;
  const raw = (process.env.GITHUB_REPOS ?? "").trim();
  return {
    token,
    allRepos: raw.toLowerCase() === "all",
    repos: raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== "all"),
    orgs: (process.env.GITHUB_ORGS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function isGithubEnabled(): boolean {
  return getGithubConfig() !== null;
}

// Why this PR is in the result set — drives whether it can notify. "org" = pulled
// only because it's in a watched org (someone else's work → list-only, no notify).
export type PullRequestRelation = "author" | "reviewer" | "assignee" | "org";

// Normalized PR the sync/UI consume — flattened from the GraphQL shape.
export interface PullRequestDTO {
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

const SEARCH_LIMIT = 100; // GraphQL search max per page — covers org-wide result sets

interface SearchNode {
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

export interface PullRequestFetch {
  viewer: string; // the token owner's login — lets the sync tell "I authored" from "review requested to me"
  prs: PullRequestDTO[];
}

// Strongest relation wins when a PR matches several queries — "reviewer" and
// "author" (personally relevant, can notify) outrank "org" (team-wide, list-only).
const RELATION_RANK: Record<PullRequestRelation, number> = { org: 0, author: 1, assignee: 2, reviewer: 3 };

// PRs where you're the author or a requested reviewer, plus every open PR in any
// watched org (GITHUB_ORGS). `review-requested:@me` drops a PR once you submit a
// review (GitHub clears you from the requested set) — a known limit; a
// `reviewed-by:@me` toggle is deferred, not silently assumed here.
export async function fetchMyPullRequests(config: GithubConfig): Promise<PullRequestFetch> {
  // Blank config (not "all", no repos, no orgs) syncs nothing — explicit opt-in.
  if (!config.allRepos && config.repos.length === 0 && config.orgs.length === 0) return { viewer: "", prs: [] };

  const client = graphql.defaults({ headers: { authorization: `token ${config.token}` } });
  const repoFilter = config.allRepos ? "" : config.repos.map((r) => `repo:${r}`).join(" ");
  const base = `is:pr is:open ${repoFilter}`.trim();

  // Each query is tagged with the relation it establishes. author/review-requested
  // are scoped by repoFilter; org queries use the org: qualifier for scope. Multiple
  // queries can't be OR'd in one GitHub search string, so run them and dedupe.
  const queries: { q: string; relation: PullRequestRelation }[] = [];
  if (config.allRepos || config.repos.length > 0) {
    queries.push({ q: `${base} author:@me`, relation: "author" });
    queries.push({ q: `${base} review-requested:@me`, relation: "reviewer" });
    queries.push({ q: `${base} assignee:@me`, relation: "assignee" });
  }
  // GITHUB_ORGS catches YOUR PRs (authored / review-requested / assigned) in these
  // orgs even when GITHUB_REPOS is a specific list. It deliberately does NOT pull
  // other people's PRs — the list only ever shows PRs you're involved in.
  for (const org of config.orgs) {
    queries.push({ q: `is:pr is:open org:${org} author:@me`, relation: "author" });
    queries.push({ q: `is:pr is:open org:${org} review-requested:@me`, relation: "reviewer" });
    queries.push({ q: `is:pr is:open org:${org} assignee:@me`, relation: "assignee" });
  }

  const viewerRes = await client<{ viewer: { login: string } }>(`query { viewer { login } }`);
  const viewer = viewerRes.viewer.login;

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
  return { viewer, prs: [...seen.values()] };
}

function toDto(node: SearchNode, relation: PullRequestRelation): PullRequestDTO {
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;
  return {
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
