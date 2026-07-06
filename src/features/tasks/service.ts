import type { Task } from "@prisma/client";

import { parseTags, type TaskPriority, type TaskStatus } from "@/types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const PRIORITY_BADGE_CLASS: Record<TaskPriority, string> = {
  high: "bg-destructive text-white",
  medium: "bg-primary text-primary-foreground",
  low: "bg-muted text-muted-foreground",
};

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
  createdAt: Date;
  updatedAt: Date;
}

type TaskRow = Task & { project?: { name: string } | null };

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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
