import { formatDistanceToNow } from "date-fns";
import { ChevronRight, ExternalLink, GitBranch, GitPullRequest } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listPullRequests } from "@/features/integrations/github/queries";
import { isGithubEnabled } from "@/features/integrations/github/service";
import { GithubSyncButton } from "@/features/integrations/github/sync-button";
import { CHECKS_BADGE, REVIEW_BADGE, type PullRequestView } from "@/features/integrations/github/types";

export default async function PullRequestsPage() {
  const enabled = isGithubEnabled();
  const prs = enabled ? await listPullRequests() : [];

  return (
    <PageShell
      title="Pull Requests"
      description="PRs you authored or were asked to review."
      actions={enabled ? <GithubSyncButton /> : undefined}
    >
      {!enabled ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          GitHub isn&rsquo;t configured. Set <code>GITHUB_TOKEN</code> in your <code>.env</code> to sync pull requests.
        </p>
      ) : prs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No open pull requests. New ones appear here automatically while the app is open.
        </p>
      ) : (
        <div className="space-y-6">
          {groupByRepo(prs).map(([repo, repoPrs]) => (
            <details key={repo} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-1 py-1 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{repo}</h2>
                <span className="text-xs text-muted-foreground">
                  {repoPrs.length} PR{repoPrs.length === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="mt-2 space-y-2">
                {repoPrs.map((pr) => {
                  const review = pr.reviewDecision ? REVIEW_BADGE[pr.reviewDecision] : null;
                  const checks = pr.checksStatus ? CHECKS_BADGE[pr.checksStatus] : null;
                  return (
                    <Card key={pr.id} className="border-border/60 transition-colors hover:border-border">
                      <CardContent className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0 space-y-1">
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 font-medium hover:text-primary"
                          >
                            <GitPullRequest className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">
                              {pr.title} <span className="text-muted-foreground">#{pr.number}</span>
                            </span>
                            <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                          </a>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>by {pr.author}</span>
                            <span>·</span>
                            <span>{formatDistanceToNow(pr.updatedAtRemote, { addSuffix: true })}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                          {pr.draft ? <Badge variant="outline">Draft</Badge> : null}
                          {review ? <Badge className={cn("border-transparent", review.className)}>{review.label}</Badge> : null}
                          {checks ? <Badge className={cn("border-transparent", checks.className)}>{checks.label}</Badge> : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </PageShell>
  );
}

// Group PRs by repo. Rows arrive newest-first (updatedAtRemote desc), so each repo
// keeps that order and repos surface in order of their most-recently-updated PR.
function groupByRepo(prs: PullRequestView[]): [string, PullRequestView[]][] {
  const groups = new Map<string, PullRequestView[]>();
  for (const pr of prs) {
    const list = groups.get(pr.repo);
    if (list) list.push(pr);
    else groups.set(pr.repo, [pr]);
  }
  return [...groups.entries()];
}

export const dynamic = "force-dynamic";
