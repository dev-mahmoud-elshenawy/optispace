"use client";

import { ChevronRight } from "lucide-react";

import { taskDaySpan, type TaskView } from "@/features/tasks/service";

import { TaskMiniRow } from "./task-project-groups";

interface SprintSubGroup {
  key: string;
  name: string;
  tasks: TaskView[];
}

// ADO iteration paths are "Project\Sprint\..."; strip the leading project
// segment so the sprint label doesn't repeat the project name it's nested under.
function sprintLabel(iterationPath: string, projectName: string): string {
  const prefix = `${projectName}\\`;
  return iterationPath.startsWith(prefix) ? iterationPath.slice(prefix.length) : iterationPath;
}

function groupBySprint(tasks: TaskView[], projectName: string): SprintSubGroup[] {
  const map = new Map<string, SprintSubGroup>();
  for (const task of tasks) {
    // A path that IS the project name (root iteration, no sprint chosen yet)
    // reads as "Canitude" nested under a "Canitude" project header — confusing.
    // Fold it into the same "No sprint" bucket as tasks with no path at all.
    const label = task.iterationPath ? sprintLabel(task.iterationPath, projectName) : null;
    const key = !label || label === projectName ? "none" : task.iterationPath!;
    const name = !label || label === projectName ? "No sprint" : label;
    const existing = map.get(key);
    if (existing) existing.tasks.push(task);
    else map.set(key, { key, name, tasks: [task] });
  }
  return [...map.values()].sort(
    (a, b) => (a.key === "none" ? 1 : 0) - (b.key === "none" ? 1 : 0) || a.name.localeCompare(b.name),
  );
}

interface TaskSprintSubGroupsProps {
  tasks: TaskView[];
  projectName: string;
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}

// Renders a project's tasks as collapsible sprint sub-groups. Shared by the
// Tasks "By Sprint" tab (nested under each project group) and the Development
// page's per-project task list.
export function TaskSprintSubGroups({ tasks, projectName, onEdit, onDelete }: TaskSprintSubGroupsProps) {
  const sprints = groupBySprint(tasks, projectName);

  return (
    <div className="space-y-2">
      {sprints.map((sprint) => {
        const span = taskDaySpan(sprint.tasks);
        return (
          <details key={sprint.key} className="group/sprint overflow-hidden rounded-md bg-muted/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-open/sprint:rotate-90" />
                {sprint.name}
              </span>
              <span className="tabular-nums">
                {sprint.tasks.length} task{sprint.tasks.length === 1 ? "" : "s"}
                {span != null ? ` · ${span} day${span === 1 ? "" : "s"}` : ""}
              </span>
            </summary>
            <div className="space-y-0.5 px-1 pb-1">
              {sprint.tasks.map((task) => (
                <TaskMiniRow key={task.id} task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
