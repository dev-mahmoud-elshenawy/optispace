"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { syncAzureDevOps } from "@/features/integrations/azure-devops/actions";
import { syncCalendar } from "@/features/calendar/actions";

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
        // Sync ADO (tasks + notifications) and the calendar cache together.
        const [ado, cal] = await Promise.all([syncAzureDevOps(), syncCalendar()]);
        if (cancelled) return;
        const adoChanged = ado.ok && (ado.imported > 0 || ado.updated > 0 || ado.pruned > 0 || ado.notified > 0);
        const calChanged = cal.ok && cal.changed > 0;
        if (adoChanged || calChanged) {
          router.refresh();
        }
        if (typeof window !== "undefined") {
          // Nudge the bell (counter + desktop push) and the calendar view to re-read.
          if (ado.ok && ado.notified > 0) window.dispatchEvent(new Event("optispace:notifications-updated"));
          if (calChanged) window.dispatchEvent(new Event("optispace:calendar-updated"));
        }
      } catch (e) {
        // Silent to the UI (no toast/overlay), but log so a real failure — e.g. a
        // stale Prisma client after a migration ("Unknown argument …") — is visible
        // in devtools instead of vanishing. Transient "Failed to fetch" lands here too.
        console.error("[optispace] auto-sync failed", e);
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
