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
  // No in-action revalidate: that would bundle a full /projects re-render (all tasks +
  // every card) into this response and block the dialog. The form router.refresh()es
  // after closing, so the update lands in the background.
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
  // See createProject: the form router.refresh()es, so we skip the blocking in-action
  // revalidate here too.
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
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!projectId || files.length === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (files.some((f) => f.size > MAX_FILE_BYTES)) {
    return { ok: false, error: "Each file must be under 8 MB." };
  }
  try {
    for (const file of files) {
      await db.projectFile.create({
        data: {
          projectId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          data: new Uint8Array(await file.arrayBuffer()),
        },
      });
    }
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

interface LinkInput {
  projectId: string;
  label: string;
  url: string;
  type: string;
  username?: string;
  secret?: string;
  notes?: string;
}

export async function addProjectLink(input: LinkInput): Promise<ActionResult> {
  if (!input.projectId || !input.label.trim() || !input.url.trim()) {
    return { ok: false, error: "Label and URL are required." };
  }
  try {
    await db.projectLink.create({
      data: {
        projectId: input.projectId,
        label: input.label.trim(),
        url: input.url.trim(),
        type: input.type || "other",
        username: input.username?.trim() || null,
        secret: input.secret?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}

export async function deleteProjectLink(id: string): Promise<ActionResult> {
  try {
    await db.projectLink.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  revalidatePath("/archive");
  return { ok: true };
}

export async function addProjectFeedback(formData: FormData): Promise<ActionResult> {
  const projectId = String(formData.get("projectId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  if (!projectId || !message) {
    return { ok: false, error: "Feedback message is required." };
  }
  const from = String(formData.get("from") ?? "").trim() || null;
  const release = String(formData.get("release") ?? "").trim() || null;

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.some((f) => f.size > MAX_FILE_BYTES)) {
    return { ok: false, error: "Each file must be under 8 MB." };
  }
  const attachments = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      mimeType: f.type || "application/octet-stream",
      data: new Uint8Array(await f.arrayBuffer()),
    })),
  );

  try {
    await db.projectFeedback.create({
      data: {
        projectId,
        message,
        from,
        release,
        attachments: attachments.length ? { create: attachments } : undefined,
      },
    });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  return { ok: true };
}

export async function deleteProjectFeedback(id: string): Promise<ActionResult> {
  try {
    await db.projectFeedback.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidateProjects();
  revalidatePath("/archive");
  return { ok: true };
}
