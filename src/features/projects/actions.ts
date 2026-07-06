"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { milestoneTitleSchema, projectSchema, type ProjectInput } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

function revalidateProjects(): void {
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function createProject(input: ProjectInput): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await db.project.create({ data: parsed.data });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}

export async function updateProject(id: string, input: ProjectInput): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await db.project.update({ where: { id }, data: parsed.data });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    await db.project.delete({ where: { id } });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}

export async function addMilestone(projectId: string, title: string): Promise<ActionResult> {
  const parsed = milestoneTitleSchema.safeParse(title);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid title" };
  }
  try {
    const order = await db.milestone.count({ where: { projectId } });
    await db.milestone.create({ data: { projectId, title: parsed.data, order } });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}

export async function toggleMilestone(id: string, done: boolean): Promise<ActionResult> {
  try {
    await db.milestone.update({ where: { id }, data: { done } });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  try {
    await db.milestone.delete({ where: { id } });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}
