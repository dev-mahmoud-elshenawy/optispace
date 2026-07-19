"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

// Surfaces a persistent, dismissible banner when a GitHub sync fails auth (token expired /
// revoked). The sync button (and any caller) dispatches "optispace:github-auth-error" — a
// token can rotate silently, and without this the sync just no-ops with no explanation.
export function GithubTokenBanner() {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onError = () => setExpired(true);
    const onOk = () => setExpired(false);
    window.addEventListener("optispace:github-auth-error", onError);
    window.addEventListener("optispace:github-auth-ok", onOk);
    return () => {
      window.removeEventListener("optispace:github-auth-error", onError);
      window.removeEventListener("optispace:github-auth-ok", onOk);
    };
  }, []);

  if (!expired) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1">
        <p className="font-medium text-foreground">GitHub token expired</p>
        <p className="text-muted-foreground">
          Your GitHub connection was rejected. Reconnect in{" "}
          <Link href="/settings" className="font-medium text-primary hover:underline">
            Settings → GitHub
          </Link>{" "}
          (run <code className="rounded bg-muted px-1">gh auth token</code> for a fresh token).
        </p>
      </div>
      <button type="button" onClick={() => setExpired(false)} className="shrink-0 text-muted-foreground hover:text-foreground">
        <X className="size-4" />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  );
}

// Shared auth-error matcher — octokit throws "Bad credentials" / 401 when the token is dead.
export function isGithubAuthError(message: string): boolean {
  return /bad credentials|401|requires authentication|not connected|unauthor/i.test(message);
}
