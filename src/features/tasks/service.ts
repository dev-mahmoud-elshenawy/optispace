import type { Task } from "@prisma/client";

import type { NotificationEvent } from "@/features/notifications/service";
import type { PullRequestView } from "@/features/integrations/github/types";
import { type ProjectStatus, type TaskPriority, type TaskStatus } from "@/types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

// Single source of truth for status dot/accent color — used by the board, list,
// dashboard, and day preview so every task (DevOps or local) styles status the same.
export const STATUS_DOT_CLASS: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/40",
  in_progress: "bg-primary",
  done: "bg-chart-2",
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

export interface DueTaskInput {
  id: string;
  title: string;
  dueDate: Date;
  projectName: string | null;
}

// One notification per (task, bucket, calendar day) — re-fires daily while a task
// stays overdue/due-soon instead of nagging every poll, but still surfaces again
// tomorrow rather than going silent forever after the first notice.
export function dueDateNotificationEvents(tasks: DueTaskInput[], now: Date = new Date()): NotificationEvent[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Build the key from local Y/M/D directly — today.toISOString() shifts by the
  // UTC offset, so east of Greenwich it silently rolls back to yesterday's date.
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const events: NotificationEvent[] = [];
  for (const task of tasks) {
    const due = new Date(task.dueDate.getFullYear(), task.dueDate.getMonth(), task.dueDate.getDate());
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

    let type: "due_soon" | "overdue" | null = null;
    let message = "";
    if (diffDays < 0) {
      type = "overdue";
      message = "Overdue";
    } else if (diffDays === 0) {
      type = "due_soon";
      message = "Due today";
    } else if (diffDays === 1) {
      type = "due_soon";
      message = "Due tomorrow";
    }
    if (!type) continue;

    events.push({
      type,
      externalId: task.id,
      title: task.title,
      url: "/tasks",
      message,
      project: task.projectName,
      actor: null,
      occurredAt: task.dueDate.toISOString(),
      dedupeKey: `due:${task.id}:${type}:${todayKey}`,
    });
  }
  return events;
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
  order: number;
  projectId: string | null;
  projectName: string | null;
  projectStatus: ProjectStatus | null;
  projectPinned: boolean;
  projectSortWeight: number;
  source: string | null;
  externalId: string | null;
  externalUrl: string | null;
  workItemType: string | null;
  adoState: string | null;
  adoPriority: number | null;
  iterationPath: string | null;
  effort: number | null;
  changedDate: Date | null;
  linkedPrRepo: string | null;
  linkedPrNumber: number | null;
  // Resolved from the GithubPullRequest cache client-side (tasks-view) — not set by toTaskView.
  linkedPr?: PullRequestView | null;
  subtasks: SubtaskView[];
  createdAt: Date;
  updatedAt: Date;
}

type TaskRow = Task & {
  project?: { name: string; status: string; pinned: boolean; sortWeight: number } | null;
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
    order: row.order,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    projectStatus: (row.project?.status as ProjectStatus) ?? null,
    projectPinned: row.project?.pinned ?? false,
    projectSortWeight: row.project?.sortWeight ?? 0,
    source: row.source,
    externalId: row.externalId,
    externalUrl: row.externalUrl,
    workItemType: row.workItemType,
    adoState: row.adoState,
    adoPriority: row.adoPriority,
    iterationPath: row.iterationPath,
    effort: row.effort,
    changedDate: row.changedDate,
    linkedPrRepo: row.linkedPrRepo,
    linkedPrNumber: row.linkedPrNumber,
    subtasks: (row.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, done: s.done })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
