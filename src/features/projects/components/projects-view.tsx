"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectStatus } from "@/types";
import type { TaskView } from "@/features/tasks/service";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER } from "../service";
import type { ProjectFeedbackItem, ProjectFileMeta, ProjectLinkItem, ProjectView } from "../service";
import { ProjectCard } from "./project-card";

// Static, always-the-same filter options (display order) — no waiting on data to
// compute which statuses are present.
const STATUS_OPTIONS: ProjectStatus[] = ["active", "production", "paused", "planning", "completed"];

interface ProjectItem {
  project: ProjectView;
  tasks: TaskView[];
  files: ProjectFileMeta[];
  links: ProjectLinkItem[];
  feedback: ProjectFeedbackItem[];
}

interface ProjectsViewProps {
  items: ProjectItem[];
  projectOptions: { id: string; name: string }[];
}

const ALL = "all";

export function ProjectsView({ items: initialItems, projectOptions }: ProjectsViewProps) {
  const [status, setStatus] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  // Own the list so an edit (status change) re-sorts/re-filters instantly, instead of
  // waiting for a server round-trip — the card's local badge update alone didn't reorder.
  const [items, setItems] = useState(initialItems);

  // Title-only search (project name), combined with the status filter — matches the
  // app convention that text search matches the name, not tags/other fields.
  const query = search.trim().toLowerCase();
  const filtered = items
    .filter(
      (it) =>
        (status === ALL || it.project.status === status) &&
        (query === "" || it.project.name.toLowerCase().includes(query)),
    )
    // Same ordering as the Development server sort, but reactive: bookmarked first, then
    // status priority (active → production → rest), then name A→Z.
    .sort((a, b) => {
      const pa = a.project;
      const pb = b.project;
      if (pa.pinned !== pb.pinned) return pa.pinned ? -1 : 1;
      const byStatus = (PROJECT_STATUS_ORDER[pa.status] ?? 99) - (PROJECT_STATUS_ORDER[pb.status] ?? 99);
      return byStatus !== 0 ? byStatus : pa.name.localeCompare(pb.name);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="h-8 w-full sm:w-64"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} project{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {filtered.map((it) => (
          <ProjectCard
            key={it.project.id}
            project={it.project}
            tasks={it.tasks}
            files={it.files}
            links={it.links}
            feedback={it.feedback}
            projectOptions={projectOptions}
            onProjectSaved={(vals) =>
              setItems((prev) =>
                prev.map((p) => (p.project.id === it.project.id ? { ...p, project: { ...p.project, ...vals } } : p)),
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
