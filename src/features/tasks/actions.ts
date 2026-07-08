"use server";

import { revalidatePath } from "next/cache";
import { addDays, addWeeks, addMonths } from "date-fns";

import { db } from "@/lib/db";
import { serializeTags, TASK_STATUSES, type TaskStatus } from "@/types";

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

function nextDueDate(from: Date, recurrence: string): Date {
  switch (recurrence) {
    case "daily":
      return addDays(from, 1);
    case "weekly":
      return addWeeks(from, 1);
    case "monthly":
      return addMonths(from, 1);
    default:
      return from;
  }
}

// When a recurring task is completed, create its next occurrence as a fresh To Do.
// Advances from the old due date if set, otherwise from today.
async function spawnNextOccurrence(task: {
  title: string;
  description: string | null;
  priority: string;
  dueDate: Date | null;
  tags: string;
  recurrence: string;
  projectId: string | null;
}): Promise<void> {
  if (task.recurrence === "none") return;
  await db.task.create({
    data: {
      title: task.title,
      description: task.description,
      status: TASK_STATUSES[0], // "todo"
      priority: task.priority,
      dueDate: nextDueDate(task.dueDate ?? new Date(), task.recurrence),
      tags: task.tags,
      recurrence: task.recurrence,
      order: 0,
      projectId: task.projectId,
    },
  });
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
      recurrence: data.recurrence,
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

  const prior = await db.task.findUnique({ where: { id }, select: { status: true } });

  await db.task.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      dueDate: toDueDate(data.dueDate),
      tags: serializeTags(data.tags),
      recurrence: data.recurrence,
      projectId: data.projectId || null,
    },
  });

  if (prior && prior.status !== TASK_STATUSES[2] && data.status === TASK_STATUSES[2] && data.recurrence !== "none") {
    await spawnNextOccurrence({
      title: data.title,
      description: data.description || null,
      priority: data.priority,
      dueDate: toDueDate(data.dueDate),
      tags: serializeTags(data.tags),
      recurrence: data.recurrence,
      projectId: data.projectId || null,
    });
  }

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

  const prior = await db.task.findUnique({ where: { id: parsed.data.id } });

  await db.task.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status, order: parsed.data.order },
  });

  if (prior && prior.status !== TASK_STATUSES[2] && parsed.data.status === TASK_STATUSES[2] && prior.recurrence !== "none") {
    await spawnNextOccurrence(prior);
  }

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
