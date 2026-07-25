import { PageShell } from "@/components/layout/page-shell";
import { listPullRequests } from "@/features/integrations/github/queries";
import { isGithubConfigured } from "@/features/integrations/github/service";
import { GithubSyncButton } from "@/features/integrations/github/sync-button";
import { GithubTokenBanner } from "@/features/integrations/github/github-token-banner";
import { PullRequestList } from "@/features/integrations/github/pr-list";

export default async function PullRequestsPage() {
  // Run both reads in parallel; PRs are soft-deleted on disconnect, so listing when not
  // configured just returns [] (cheap) rather than gating a second round-trip.
  const [enabled, allPrs] = await Promise.all([isGithubConfigured(), listPullRequests()]);
  const prs = enabled ? allPrs : [];

  return (
    <PageShell
      title="Pull Requests"
      description="PRs you authored or were asked to review."
      actions={enabled ? <GithubSyncButton /> : undefined}
    >
      <GithubTokenBanner />
      {!enabled ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          GitHub isn&rsquo;t connected. Connect your account in <code>Settings</code> to sync pull requests.
        </p>
      ) : prs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No open pull requests. New ones appear here automatically while the app is open.
        </p>
      ) : (
        <PullRequestList prs={prs} />
      )}
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
