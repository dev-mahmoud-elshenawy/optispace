"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { syncGithubPullRequests } from "./actions";

export function GithubSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSync() {
    startTransition(async () => {
      const result = await syncGithubPullRequests();
      if (result.ok) {
        toast.success(`Synced — ${result.upserted} open, ${result.pruned} closed out.`);
        router.refresh();
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
