"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { NAV_ITEMS } from "@/lib/nav";
import type { SearchItem, SearchItemType } from "@/features/search/types";
import { runScheduledBackup } from "@/features/backup/actions";
import { syncCalendar } from "@/features/calendar/actions";
import { syncAzureDevOps } from "@/features/integrations/azure-devops/actions";
import { syncGithubPullRequests } from "@/features/integrations/github/actions";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const GROUP_ORDER: SearchItemType[] = [
  "Task",
  "Project",
  "Package",
  "Profile",
  "Milestone",
  "PullRequest",
  "Feedback",
  "Leave",
  "Notification",
  "Link",
  "File",
];

// Display heading per group (PullRequest → "Pull Requests", not "PullRequests").
const GROUP_HEADINGS: Record<SearchItemType, string> = {
  Task: "Tasks",
  Project: "Projects",
  Package: "Packages",
  Profile: "Profiles",
  Milestone: "Milestones",
  PullRequest: "Pull Requests",
  Feedback: "Feedback",
  Leave: "Leave",
  Notification: "Notifications",
  Link: "Links",
  File: "Files",
};

export function CommandPalette({ items = [] }: { items?: SearchItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("optispace:open-command", onOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("optispace:open-command", onOpen);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function syncAll() {
    setOpen(false);
    toast.info("Syncing integrations…");
    await Promise.allSettled([syncAzureDevOps(), syncGithubPullRequests(), syncCalendar()]);
    toast.success("Synced all integrations.");
    router.refresh();
  }

  async function backupNow() {
    setOpen(false);
    const res = await runScheduledBackup();
    if (res.ok) {
      toast.success(res.created ? "Backup created." : "Already backed up today.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, tasks, projects, packages…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem value="sync all integrations azure devops github calendar" onSelect={syncAll}>
            <RefreshCw />
            Sync all integrations
          </CommandItem>
          <CommandItem value="back up now backup database" onSelect={backupNow}>
            <DatabaseBackup />
            Back up now
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.href} value={`${item.label} page`} onSelect={() => go(item.href)}>
                <Icon />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        {GROUP_ORDER.map((type) => {
          const group = items.filter((it) => it.type === type);
          if (group.length === 0) return null;
          return (
            <CommandGroup key={type} heading={GROUP_HEADINGS[type]}>
              {group.map((it, i) => (
                <CommandItem
                  key={`${type}-${i}`}
                  value={`${it.label} ${type} ${it.keywords ?? ""}`}
                  onSelect={() => go(it.href)}
                >
                  <span className="truncate">{it.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{type}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
