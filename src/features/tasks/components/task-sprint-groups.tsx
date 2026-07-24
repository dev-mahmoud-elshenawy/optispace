"use client";

import { ChevronRight } from "lucide-react";

import { type TaskView } from "@/features/tasks/service";
import { PROJECT_STATUS_ORDER } from "@/features/projects/service";
import type { ProjectStatus } from "@/types";

import { TaskSprintSubGroups } from "./task-sprint-subgroups";

interface ProjectGroup {
  key: string;
  name: string;
  status: ProjectStatus | null;
  tasks: TaskView[];
}

// Project is the top-level group; sprints are sub-groups within it.
function groupByProject(tasks: TaskView[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const task of tasks) {
    const key = task.projectId ?? "none";
    const existing = map.get(key);
    if (existing) existing.tasks.push(task);
    else map.set(key, { key, name: task.projectName ?? "No project", status: task.projectStatus, tasks: [task] });
  }
  // Prioritize by project status (active first, done last, no-project last) — same as
  // the Development page and the "By project" view; alphabetical within a status.
  const rank = (g: ProjectGroup) => (g.key === "none" ? 99 : g.status ? PROJECT_STATUS_ORDER[g.status] : 98);
  return [...map.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function sprintCount(tasks: TaskView[]): number {
  return new Set(tasks.map((t) => t.iterationPath ?? "none")).size;
}

interface TaskSprintGroupsProps {
  tasks: TaskView[];
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}

export function TaskSprintGroups({ tasks, onEdit, onDelete }: TaskSprintGroupsProps) {
  const groups = groupByProject(tasks);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((project) => (
        <details key={project.key} className="group overflow-hidden rounded-lg border border-border/60 bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 font-medium">
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
              {project.name}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {sprintCount(project.tasks)} sprint{sprintCount(project.tasks) === 1 ? "" : "s"} · {project.tasks.length} task
              {project.tasks.length === 1 ? "" : "s"}
            </span>
          </summary>
          <div className="border-t border-border/60 p-3">
            <TaskSprintSubGroups tasks={project.tasks} projectName={project.name} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </details>
      ))}
    </div>
  );
}
