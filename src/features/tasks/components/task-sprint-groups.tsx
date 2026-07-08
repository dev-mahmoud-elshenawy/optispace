"use client";

import { ChevronRight } from "lucide-react";

import { taskDaySpan, type TaskView } from "@/features/tasks/service";

import { TaskMiniRow } from "./task-project-groups";

interface SprintGroup {
  key: string;
  name: string;
  tasks: TaskView[];
}

// Groups synced tasks by their ADO iteration path (sprint). Only DevOps tasks
// carry an iterationPath; local tasks fall into "No sprint".
function groupBySprint(tasks: TaskView[]): SprintGroup[] {
  const map = new Map<string, SprintGroup>();
  for (const task of tasks) {
    const key = task.iterationPath ?? "none";
    const existing = map.get(key);
    if (existing) existing.tasks.push(task);
    else map.set(key, { key, name: task.iterationPath ?? "No sprint", tasks: [task] });
  }
  return [...map.values()].sort(
    (a, b) => (a.key === "none" ? 1 : 0) - (b.key === "none" ? 1 : 0) || a.name.localeCompare(b.name),
  );
}

interface TaskSprintGroupsProps {
  tasks: TaskView[];
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}

export function TaskSprintGroups({ tasks, onEdit, onDelete }: TaskSprintGroupsProps) {
  const groups = groupBySprint(tasks);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const span = taskDaySpan(group.tasks);
        return (
          <details key={group.key} className="group overflow-hidden rounded-lg border border-border/60 bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 font-medium">
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                {group.name}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
                {span != null ? ` · ${span} day${span === 1 ? "" : "s"}` : ""}
              </span>
            </summary>
            <div className="space-y-0.5 border-t border-border/60 p-2">
              {group.tasks.map((task) => (
                <TaskMiniRow key={task.id} task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
