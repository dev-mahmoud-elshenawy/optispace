"use client";

import { format } from "date-fns";
import { ChevronRight, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_DOT_CLASS, taskDaySpan, type TaskView } from "@/features/tasks/service";

import { PriorityFlag } from "./priority-flag";
import { TaskBoard } from "./task-board";


interface ProjectGroup {
  key: string;
  name: string;
  tasks: TaskView[];
}

function groupByProject(tasks: TaskView[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const task of tasks) {
    const key = task.projectId ?? "none";
    const existing = map.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      map.set(key, { key, name: task.projectName ?? "No project", tasks: [task] });
    }
  }
  return [...map.values()].sort(
    (a, b) => (a.key === "none" ? 1 : 0) - (b.key === "none" ? 1 : 0) || a.name.localeCompare(b.name)
  );
}

export function TaskMiniRow({
  task,
  onEdit,
  onDelete,
}: {
  task: TaskView;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const showActions = onEdit || onDelete;
  return (
    <div className="group/row flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50">
      <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT_CLASS[task.status])} />
      {onEdit ? (
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate text-left hover:text-primary hover:underline">
          {task.title}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate">{task.title}</span>
      )}
      <PriorityFlag priority={task.priority} />
      {task.dueDate ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{format(task.dueDate, "MMM d")}</span>
      ) : null}
      {showActions ? (
        <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
          {onDelete && task.source !== "azure_devops" ? (
            <Button variant="ghost" size="icon-xs" onClick={onDelete}>
              <Trash2Icon />
              <span className="sr-only">Delete</span>
            </Button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

interface TaskProjectGroupsProps {
  tasks: TaskView[];
  onTasksChange: (tasks: TaskView[]) => void;
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
  onStatusPick?: (task: TaskView) => void;
  sorted?: boolean;
}

export function TaskProjectGroups({ tasks, onTasksChange, onEdit, onDelete, onStatusPick, sorted }: TaskProjectGroupsProps) {
  const groups = groupByProject(tasks);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet.</p>;
  }

  // A board only reorders/moves within one project, so merge its updated
  // subset back into the full task list by id — membership never changes.
  function handleGroupChange(updatedGroupTasks: TaskView[]) {
    const byId = new Map(updatedGroupTasks.map((t) => [t.id, t]));
    onTasksChange(tasks.map((t) => byId.get(t.id) ?? t));
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
            <div className="border-t border-border/60 p-3">
              <TaskBoard
                id={`board-${group.key}`}
                tasks={group.tasks}
                onTasksChange={handleGroupChange}
                onEdit={onEdit}
                onDelete={onDelete}
                onStatusPick={onStatusPick}
                sorted={sorted}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}
