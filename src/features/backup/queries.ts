import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";

export const BACKUP_DIR = path.join(process.cwd(), "backups");

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

// Full data export — every table, including soft-deleted rows, so a backup is
// complete and restorable. ProjectFile/FeedbackAttachment bytes are base64-encoded
// for JSON. Shared by the manual /api/backup download and the scheduled backup.
export async function buildBackupPayload(): Promise<BackupPayload> {
  const [
    leaveAllowances,
    leaves,
    profiles,
    projects,
    milestones,
    tasks,
    packages,
    projectFiles,
    projectLinks,
    projectFeedback,
    feedbackAttachments,
  ] = await Promise.all([
    db.leaveAllowance.findMany(),
    db.leave.findMany(),
    db.profile.findMany(),
    db.project.findMany(),
    db.milestone.findMany(),
    db.task.findMany(),
    db.package.findMany(),
    db.projectFile.findMany(),
    db.projectLink.findMany(),
    db.projectFeedback.findMany(),
    db.feedbackAttachment.findMany(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      leaveAllowances,
      leaves,
      profiles,
      projects,
      milestones,
      tasks,
      packages,
      projectFiles: projectFiles.map((f) => ({ ...f, data: Buffer.from(f.data).toString("base64") })),
      projectLinks,
      projectFeedback,
      feedbackAttachments: feedbackAttachments.map((a) => ({ ...a, data: Buffer.from(a.data).toString("base64") })),
    },
  };
}

export interface ScheduledBackupFile {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

// Lists on-disk scheduled backups (backups/backup-YYYY-MM-DD.json), newest first.
export async function listScheduledBackups(): Promise<ScheduledBackupFile[]> {
  const names = await fs.readdir(BACKUP_DIR).catch(() => [] as string[]);
  const files = await Promise.all(
    names
      .filter((name) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map(async (name) => {
        const stat = await fs.stat(path.join(BACKUP_DIR, name));
        return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      }),
  );
  return files.sort((a, b) => b.name.localeCompare(a.name));
}
