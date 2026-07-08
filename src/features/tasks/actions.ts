"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { serializeTags, type TaskStatus } from "@/types";

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
      tags: serializeTags(data.tags),
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
      tags: serializeTags(data.tags),
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

// ponytail: persists only the dragged card's status+order, not sibling order
// values in the destination column. Fine for a single-user local app; add a
// batch reorder action if column order must survive a hard reload exactly.
export async function moveTask(id: string, status: TaskStatus, order: number): Promise<ActionResult> {
  const parsed = moveTaskSchema.safeParse({ id, status, order });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  await db.task.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status, order: parsed.data.order },
  });

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
