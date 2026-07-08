import type { Task } from "@prisma/client";

import { parseTags, type TaskPriority, type TaskRecurrence, type TaskStatus } from "@/types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const PRIORITY_FLAG_CLASS: Record<TaskPriority, string> = {
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "border-border bg-muted text-muted-foreground",
};

// Inclusive calendar-day span from the earliest to the latest task due date.
// Returns null when no task in the set has a due date.
export function taskDaySpan(tasks: { dueDate: Date | null }[]): number | null {
  const times = tasks.map((t) => t.dueDate?.getTime()).filter((t): t is number => t != null);
  if (times.length === 0) {
    return null;
  }
  return Math.round((Math.max(...times) - Math.min(...times)) / 86_400_000) + 1;
}

export interface SubtaskView {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskView {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  tags: string[];
  order: number;
  projectId: string | null;
  projectName: string | null;
  recurrence: TaskRecurrence;
  subtasks: SubtaskView[];
  createdAt: Date;
  updatedAt: Date;
}

type TaskRow = Task & {
  project?: { name: string } | null;
  subtasks?: { id: string; title: string; done: boolean }[];
};

export function toTaskView(row: TaskRow): TaskView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    dueDate: row.dueDate,
    tags: parseTags(row.tags),
    order: row.order,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    recurrence: row.recurrence as TaskRecurrence,
    subtasks: (row.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, done: s.done })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
