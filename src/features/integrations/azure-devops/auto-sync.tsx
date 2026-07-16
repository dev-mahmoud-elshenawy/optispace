"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { syncAzureDevOps } from "@/features/integrations/azure-devops/actions";
import { syncCalendar, checkMeetingReminders } from "@/features/calendar/actions";
import { checkTaskDueDates } from "@/features/tasks/actions";
import { runScheduledBackup } from "@/features/backup/actions";
import { refreshStalePackageStats } from "@/features/packages/actions";
import { syncGithubPullRequests } from "@/features/integrations/github/actions";

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
        // Sync ADO (tasks + notifications), the calendar cache, local due-date
        // reminders, and the scheduled backup together. Due-date checks and the
        // backup have no external source, so they run every tick regardless of
        // whether ADO/Calendar are configured; the backup itself is a cheap fs.stat
        // no-op after the first successful run each calendar day.
        const [ado, cal, due, backup, packages, github, meetings] = await Promise.all([
          syncAzureDevOps(),
          syncCalendar(),
          checkTaskDueDates(),
          runScheduledBackup(),
          refreshStalePackageStats(),
          syncGithubPullRequests(),
          checkMeetingReminders(),
        ]);
        if (cancelled) return;
        if (!backup.ok) console.error("[optispace] scheduled backup failed", backup.error);
        const adoChanged = ado.ok && (ado.imported > 0 || ado.updated > 0 || ado.pruned > 0 || ado.notified > 0);
        const calChanged = cal.ok && cal.changed > 0;
        const dueNotified = due.notified > 0;
        const packagesChanged = packages.refreshed > 0;
        const githubChanged = github.ok && (github.upserted > 0 || github.pruned > 0 || github.notified > 0);
        const githubNotified = github.ok && github.notified > 0;
        const meetingsNotified = meetings.notified > 0;
        if (adoChanged || calChanged || dueNotified || packagesChanged || githubChanged || meetingsNotified) {
          router.refresh();
        }
        if (typeof window !== "undefined") {
          // Nudge the bell (counter + desktop push) and the calendar view to re-read.
          if ((ado.ok && ado.notified > 0) || dueNotified || githubNotified || meetingsNotified) window.dispatchEvent(new Event("optispace:notifications-updated"));
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
