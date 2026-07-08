"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { syncAzureDevOps } from "@/features/integrations/azure-devops/actions";

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Local-first "background" sync: runs on mount and on an interval while the app
// is open. Silent (no toasts); refreshes the view only when something changed.
export function AzureDevOpsAutoSync({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function run() {
      if (running.current) return;
      running.current = true;
      try {
        const result = await syncAzureDevOps();
        if (!cancelled && result.ok && (result.imported > 0 || result.updated > 0 || result.pruned > 0)) {
          router.refresh();
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
