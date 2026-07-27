import "server-only";

import { db } from "@/lib/db";

import { toTaskView, type TaskView } from "./service";

export async function listTasks(): Promise<TaskView[]> {
  const rows = await db.task.findMany({
    where: { deletedAt: null },
    include: {
      project: { select: { name: true, status: true, pinned: true, sortWeight: true } },
      subtasks: { where: { deletedAt: null }, orderBy: { order: "asc" }, select: { id: true, title: true, done: true } },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toTaskView);
}

// Only tasks that belong to a project — for the Development page, which ignores
// unassigned tasks. Much lighter than listTasks() when most tasks aren't project-linked.
export async function listProjectTasks(): Promise<TaskView[]> {
  const rows = await db.task.findMany({
    where: { deletedAt: null, projectId: { not: null } },
    include: {
      project: { select: { name: true, status: true, pinned: true, sortWeight: true } },
      subtasks: { where: { deletedAt: null }, orderBy: { order: "asc" }, select: { id: true, title: true, done: true } },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toTaskView);
}

export async function listProjectOptions(): Promise<{ id: string; name: string }[]> {
  return db.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

