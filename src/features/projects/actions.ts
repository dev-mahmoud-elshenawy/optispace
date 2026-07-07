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
  const now = new Date();
  try {
    // Soft delete the project, and mirror the old FK behaviour: soft delete its
    // milestones (was onDelete: Cascade) and unlink tasks/packages (was SetNull).
    await db.$transaction([
      db.project.update({ where: { id }, data: { deletedAt: now } }),
      db.milestone.updateMany({ where: { projectId: id, deletedAt: null }, data: { deletedAt: now } }),
      db.task.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      db.package.updateMany({ where: { projectId: id }, data: { projectId: null } }),
    ]);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  revalidatePath("/tasks");
  revalidatePath("/packages");
  revalidatePath("/");
  return { ok: true };
}

export async function addMilestone(projectId: string, title: string): Promise<ActionResult> {
  const parsed = milestoneTitleSchema.safeParse(title);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid title" };
  }
  try {
    const order = await db.milestone.count({ where: { projectId, deletedAt: null } });
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
    await db.milestone.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function uploadProjectFile(formData: FormData): Promise<ActionResult> {
  const projectId = String(formData.get("projectId") ?? "");
  const file = formData.get("file");
  if (!projectId || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "File too large (max 8 MB)." };
  }
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    await db.projectFile.create({
      data: {
        projectId,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        data,
      },
    });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}

export async function deleteProjectFile(id: string): Promise<ActionResult> {
  try {
    await db.projectFile.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  revalidatePath("/archive");
  return { ok: true };
}
