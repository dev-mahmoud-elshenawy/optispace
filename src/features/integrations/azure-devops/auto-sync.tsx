"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { syncAzureDevOps } from "@/features/integrations/azure-devops/actions";

const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes — near-real-time detection of new
// assignments/mentions (local-first: a webhook would need a public URL, so a short
// poll is the closest equivalent while the app is open).
const DEDUPE_MS = 15 * 1000; // skip a sync if another started this recently

// Cross-context (multi-tab / StrictMode double-mount / rapid reload) dedupe via
// localStorage: only one sync runs within DEDUPE_MS. Returns false if a sync
// started too recently to run again.
function claimSync(): boolean {
  try {
    const last = Number(localStorage.getItem("optispace:lastSyncAt") ?? 0);
    if (Date.now() - last < DEDUPE_MS) return false;
    localStorage.setItem("optispace:lastSyncAt", String(Date.now()));
    return true;
  } catch {
    return true; // localStorage unavailable → don't block syncing
  }
}

// Local-first "background" sync: runs on mount and on an interval while the app
// is open. Silent (no toasts); refreshes the view only when something changed.
export function AzureDevOpsAutoSync({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function run() {
      if (running.current || !claimSync()) return;
      running.current = true;
      try {
        const result = await syncAzureDevOps();
        if (cancelled || !result.ok) return;
        if (result.imported > 0 || result.updated > 0 || result.pruned > 0 || result.notified > 0) {
          router.refresh();
        }
        // Tell the bell to re-poll immediately (counter + desktop push) instead of
        // waiting for its next 60s tick — this is what removes the "refresh twice" lag.
        if (result.notified > 0 && typeof window !== "undefined") {
          window.dispatchEvent(new Event("optispace:notifications-updated"));
        }
      } finally {
        running.current = false;
      }
    }

    run();
    const id = setInterval(run, INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, router]);

  return null;
}
