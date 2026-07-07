import "server-only";

import { db } from "@/lib/db";
import { TASK_STATUSES, type TaskStatus } from "@/types";

import { toTaskView, type TaskView } from "./service";

export async function listTasks(): Promise<TaskView[]> {
  const rows = await db.task.findMany({
    where: { deletedAt: null },
    include: { project: { select: { name: true } } },
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

export async function getTaskStatusCounts(): Promise<Record<TaskStatus, number>> {
  const counts = await db.task.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } });
  const result = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<
    TaskStatus,
    number
  >;
  for (const row of counts) {
    if (TASK_STATUSES.includes(row.status as TaskStatus)) {
      result[row.status as TaskStatus] = row._count._all;
    }
  }
  return result;
}
