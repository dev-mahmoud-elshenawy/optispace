"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectStatus } from "@/types";
import type { TaskView } from "@/features/tasks/service";
import { PROJECT_STATUS_LABELS } from "../service";
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

export function ProjectsView({ items, projectOptions }: ProjectsViewProps) {
  const [status, setStatus] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  // Title-only search (project name), combined with the status filter — matches the
  // app convention that text search matches the name, not tags/other fields.
  const query = search.trim().toLowerCase();
  const filtered = items.filter(
    (it) =>
      (status === ALL || it.project.status === status) &&
      (query === "" || it.project.name.toLowerCase().includes(query)),
  );

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
          />
        ))}
      </div>
    </div>
  );
}
