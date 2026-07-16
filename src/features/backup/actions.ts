"use server";

import fs from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

import { BACKUP_DIR, buildBackupPayload } from "./queries";

export type ActionResult = { ok: true; restored: number } | { ok: false; error: string };

const RETENTION_DAYS = 14;

async function pruneOldBackups(): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  const names = await fs.readdir(BACKUP_DIR).catch(() => [] as string[]);
  for (const name of names) {
    if (!/^backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
    const full = path.join(BACKUP_DIR, name);
    const stat = await fs.stat(full).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) await fs.unlink(full).catch(() => {});
  }
}

export type ScheduledBackupResult = { ok: true; created: boolean } | { ok: false; error: string };

// Called from the background poller (and the manual "Back up now" button). Writes
// the same version:1 JSON shape the manual /api/backup export produces, once per
// calendar day — a cheap fs.stat short-circuits every call after the first each
// day, so it's safe to call on every 2-minute poll tick.
export async function runScheduledBackup(): Promise<ScheduledBackupResult> {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = path.join(BACKUP_DIR, `backup-${stamp}.json`);
    const exists = await fs
      .stat(file)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      const payload = await buildBackupPayload();
      await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf-8");
      await pruneOldBackups();
    }
    return { ok: true, created: !exists };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Scheduled backup failed." };
  }
}

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
