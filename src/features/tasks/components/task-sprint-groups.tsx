"use client";

import { ChevronRight } from "lucide-react";

import { taskDaySpan, type TaskView } from "@/features/tasks/service";

import { TaskMiniRow } from "./task-project-groups";

interface SprintSubGroup {
  key: string;
  name: string;
  tasks: TaskView[];
}

interface ProjectGroup {
  key: string;
  name: string;
  sprints: SprintSubGroup[];
  taskCount: number;
}

// ADO iteration paths are "Project\Sprint\..."; strip the leading project
// segment so the sprint label doesn't repeat the project name it's nested under.
function sprintLabel(iterationPath: string, projectName: string): string {
  const prefix = `${projectName}\\`;
  return iterationPath.startsWith(prefix) ? iterationPath.slice(prefix.length) : iterationPath;
}

// Project is the top-level group; sprints are sub-groups within it.
function groupByProjectThenSprint(tasks: TaskView[]): ProjectGroup[] {
  const projects = new Map<string, { name: string; tasks: TaskView[] }>();
  for (const task of tasks) {
    const key = task.projectId ?? "none";
    const existing = projects.get(key);
    if (existing) existing.tasks.push(task);
    else projects.set(key, { name: task.projectName ?? "No project", tasks: [task] });
  }

  return [...projects.entries()]
    .map(([key, { name, tasks: projectTasks }]) => {
      const sprintMap = new Map<string, SprintSubGroup>();
      for (const task of projectTasks) {
        const sKey = task.iterationPath ?? "none";
        const sName = task.iterationPath ? sprintLabel(task.iterationPath, name) : "No sprint";
        const existing = sprintMap.get(sKey);
        if (existing) existing.tasks.push(task);
        else sprintMap.set(sKey, { key: sKey, name: sName, tasks: [task] });
      }
      const sprints = [...sprintMap.values()].sort(
        (a, b) => (a.key === "none" ? 1 : 0) - (b.key === "none" ? 1 : 0) || a.name.localeCompare(b.name),
      );
      return { key, name, sprints, taskCount: projectTasks.length };
    })
    .sort((a, b) => (a.key === "none" ? 1 : 0) - (b.key === "none" ? 1 : 0) || a.name.localeCompare(b.name));
}

interface TaskSprintGroupsProps {
  tasks: TaskView[];
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}

export function TaskSprintGroups({ tasks, onEdit, onDelete }: TaskSprintGroupsProps) {
  const groups = groupByProjectThenSprint(tasks);

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
              {project.taskCount} task{project.taskCount === 1 ? "" : "s"}
            </span>
          </summary>
          <div className="space-y-2 border-t border-border/60 p-3">
            {project.sprints.map((sprint) => {
              const span = taskDaySpan(sprint.tasks);
              return (
                <div key={sprint.key} className="rounded-md bg-muted/30 p-2">
                  <div className="flex items-center justify-between px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                    <span>{sprint.name}</span>
                    <span className="tabular-nums">
                      {sprint.tasks.length} task{sprint.tasks.length === 1 ? "" : "s"}
                      {span != null ? ` · ${span} day${span === 1 ? "" : "s"}` : ""}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {sprint.tasks.map((task) => (
                      <TaskMiniRow key={task.id} task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
