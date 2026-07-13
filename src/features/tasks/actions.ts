"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { type TaskStatus } from "@/types";

import { moveTaskSchema, subtaskTitleSchema, taskInputSchema, type TaskInput } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function toDueDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function firstError(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid task data";
}

export async function createTask(input: TaskInput): Promise<ActionResult> {
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;

  const last = await db.task.findFirst({
    where: { status: data.status, deletedAt: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await db.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      dueDate: toDueDate(data.dueDate),
      order: (last?.order ?? -1) + 1,
      projectId: data.projectId || null,
    },
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
  await db.subtask.update({ where: { id }, data: { done } });
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteSubtask(id: string): Promise<ActionResult> {
  await db.subtask.update({ where: { id }, data: { deletedAt: new Date() } });
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
