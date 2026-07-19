"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { syncGithubPullRequests } from "./actions";
import { isGithubAuthError } from "./github-token-banner";

export function GithubSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSync() {
    startTransition(async () => {
      const result = await syncGithubPullRequests();
      if (result.ok) {
        window.dispatchEvent(new Event("optispace:github-auth-ok"));
        toast.success(`Synced — ${result.upserted} open, ${result.pruned} closed out.`);
        router.refresh();
      } else if (isGithubAuthError(result.error)) {
        // Token expired/revoked — surface the persistent reconnect banner, not just a toast.
        window.dispatchEvent(new Event("optispace:github-auth-error"));
        toast.error("GitHub token expired — reconnect in Settings.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={pending}>
      <RefreshCw className="h-4 w-4" />
      Sync now
    </Button>
  );
}
