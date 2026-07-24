"use server";

import { revalidatePath } from "next/cache";

import { recordNotifications } from "@/features/notifications/actions";
import { db } from "@/lib/db";
import { type TaskStatus } from "@/types";

import { moveTaskSchema, subtaskTitleSchema, taskInputSchema, type TaskInput } from "./schema";
import { dueDateNotificationEvents, type DueTaskInput } from "./service";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toDueDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function firstError(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid task data";
}

export async function createTask(input: TaskInput, subtaskTitles: string[] = []): Promise<ActionResult> {
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;

  // Keep only non-empty subtask titles, in the order the user entered them.
  const titles = subtaskTitles.map((t) => t.trim()).filter((t) => t.length > 0);

  const last = await db.task.findFirst({
    where: { status: data.status, deletedAt: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  // Task + its subtasks are created atomically so a partial failure can't leave a
  // task with half its checklist.
  await db.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title: data.title,
        description: data.description || null,
        status: data.status,
        priority: data.priority,
        dueDate: toDueDate(data.dueDate),
        order: (last?.order ?? -1) + 1,
        projectId: data.projectId || null,
        linkedPrRepo: data.linkedPrRepo || null,
        linkedPrNumber: data.linkedPrNumber ?? null,
      },
      select: { id: true },
    });
    if (titles.length > 0) {
      await tx.subtask.createMany({
        data: titles.map((title, i) => ({ taskId: created.id, title, order: i })),
      });
    }
  });

  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function updateTask(id: string, input: TaskInput): Promise<ActionResult> {
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;

  await db.task.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      dueDate: toDueDate(data.dueDate),
      projectId: data.projectId || null,
      linkedPrRepo: data.linkedPrRepo || null,
      linkedPrNumber: data.linkedPrNumber ?? null,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  await db.task.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

// Renumber the destination column contiguously (orderedIds = the full column
// order after the drop, dragged card included) so sibling `order` values never
// collide — a collision is what made cards jump to the wrong slot on reload.
export async function moveTask(id: string, status: TaskStatus, orderedIds: string[]): Promise<ActionResult> {
  const parsed = moveTaskSchema.safeParse({ id, status, orderedIds });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  await db.$transaction([
    db.task.update({ where: { id: parsed.data.id }, data: { status: parsed.data.status } }),
    ...parsed.data.orderedIds.map((taskId, index) =>
      db.task.update({ where: { id: taskId }, data: { order: index } }),
    ),
  ]);

  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export type AddSubtaskResult =
  | { ok: true; subtask: { id: string; title: string; done: boolean } }
  | { ok: false; error: string };

export async function addSubtask(taskId: string, title: string): Promise<AddSubtaskResult> {
  const parsed = subtaskTitleSchema.safeParse(title);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const last = await db.subtask.findFirst({
    where: { taskId, deletedAt: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const subtask = await db.subtask.create({
    data: { taskId, title: parsed.data, order: (last?.order ?? -1) + 1 },
    select: { id: true, title: true, done: true },
  });

  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true, subtask };
}

export async function toggleSubtask(id: string, done: boolean): Promise<ActionResult> {
  // updateMany (not update) so a missing/already-deleted row returns a clean error
  // instead of throwing Prisma's P2025 out of the server action.
  const { count } = await db.subtask.updateMany({ where: { id, deletedAt: null }, data: { done } });
  if (count === 0) return { ok: false, error: "Subtask not found." };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteSubtask(id: string): Promise<ActionResult> {
  const { count } = await db.subtask.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (count === 0) return { ok: false, error: "Subtask not found." };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

// Bulk-reassign tasks to a project (or clear with null).
export async function moveTasksToProject(ids: string[], projectId: string | null): Promise<ActionResult> {
  if (ids.length === 0) return { ok: false, error: "No tasks selected." };
  await db.task.updateMany({ where: { id: { in: ids } }, data: { projectId } });
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true };
}

// Bulk set status. Callers pass local-task ids only — sync owns ADO task status,
// so a local flip on a synced task would be overwritten on the next poll.
export async function setTasksStatus(ids: string[], status: TaskStatus): Promise<ActionResult> {
  if (ids.length === 0) return { ok: false, error: "No tasks selected." };
  await db.task.updateMany({ where: { id: { in: ids } }, data: { status } });
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

// Bulk soft-delete. Local tasks only (sync never deletes local rows; ADO tasks are
// pruned by the sync, not the user).
export async function deleteTasks(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return { ok: false, error: "No tasks selected." };
  await db.task.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

// Called from the background poller alongside the ADO/calendar sync — surfaces a
// notification for tasks due today/tomorrow or overdue. Local-only (no external
// source), so it runs regardless of whether ADO or Calendar are configured.
export async function checkTaskDueDates(): Promise<{ ok: true; notified: number }> {
  const rows = await db.task.findMany({
    where: { deletedAt: null, status: { not: "done" }, dueDate: { not: null } },
    select: { id: true, title: true, dueDate: true, project: { select: { name: true } } },
  });
  const dueTasks: DueTaskInput[] = rows
    .filter((r): r is typeof r & { dueDate: Date } => r.dueDate != null)
    .map((r) => ({ id: r.id, title: r.title, dueDate: r.dueDate, projectName: r.project?.name ?? null }));

  const events = dueDateNotificationEvents(dueTasks);
  let notified = 0;
  if (events.length > 0) {
    notified = await recordNotifications(events);
    if (notified > 0) revalidatePath("/notifications");
  }
  return { ok: true, notified };
}
