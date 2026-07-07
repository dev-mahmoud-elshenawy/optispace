"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export type ActionResult = { ok: true; restored: number } | { ok: false; error: string };

interface BackupRow {
  id: string;
  [key: string]: unknown;
}

// Upserts rows by id inside one transaction. Order matters: parents (projects)
// before children (milestones/tasks/packages/files) so relations resolve.
export async function importBackup(formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a backup file." };
  }

  let payload: { version?: number; data?: Record<string, BackupRow[]> };
  try {
    payload = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (payload.version !== 1 || !payload.data) {
    return { ok: false, error: "Unrecognized backup format." };
  }

  const d = payload.data;
  const ops = [
    ...(d.leaveAllowances ?? []).map((r) => db.leaveAllowance.upsert({ where: { id: r.id }, create: r as never, update: r as never })),
    ...(d.leaves ?? []).map((r) => db.leave.upsert({ where: { id: r.id }, create: r as never, update: r as never })),
    ...(d.profiles ?? []).map((r) => db.profile.upsert({ where: { id: r.id }, create: r as never, update: r as never })),
    ...(d.projects ?? []).map((r) => db.project.upsert({ where: { id: r.id }, create: r as never, update: r as never })),
    ...(d.milestones ?? []).map((r) => db.milestone.upsert({ where: { id: r.id }, create: r as never, update: r as never })),
    ...(d.tasks ?? []).map((r) => db.task.upsert({ where: { id: r.id }, create: r as never, update: r as never })),
    ...(d.packages ?? []).map((r) => db.package.upsert({ where: { id: r.id }, create: r as never, update: r as never })),
    ...(d.projectFiles ?? []).map((r) => {
      const { data, ...rest } = r as BackupRow & { data: string };
      const bytes = new Uint8Array(Buffer.from(data, "base64"));
      const row = { ...rest, data: bytes };
      return db.projectFile.upsert({ where: { id: r.id }, create: row as never, update: row as never });
    }),
    ...(d.projectLinks ?? []).map((r) => db.projectLink.upsert({ where: { id: r.id }, create: r as never, update: r as never })),
    ...(d.projectFeedback ?? []).map((r) => db.projectFeedback.upsert({ where: { id: r.id }, create: r as never, update: r as never })),
    ...(d.feedbackAttachments ?? []).map((r) => {
      const { data, ...rest } = r as BackupRow & { data: string };
      const bytes = new Uint8Array(Buffer.from(data, "base64"));
      const row = { ...rest, data: bytes };
      return db.feedbackAttachment.upsert({ where: { id: r.id }, create: row as never, update: row as never });
    }),
  ];

  try {
    await db.$transaction(ops);
  } catch {
    return { ok: false, error: "Import failed — the backup may be corrupt or from an incompatible version." };
  }

  for (const path of ["/", "/leave", "/profiles", "/tasks", "/projects", "/packages", "/archive"]) {
    revalidatePath(path);
  }
  return { ok: true, restored: ops.length };
}
