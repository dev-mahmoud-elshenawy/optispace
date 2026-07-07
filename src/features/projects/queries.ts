import "server-only";
import { db } from "@/lib/db";
import {
  toProjectView,
  type ProjectFeedbackItem,
  type ProjectFileMeta,
  type ProjectLinkItem,
  type ProjectView,
} from "./service";

export async function listProjects(): Promise<ProjectView[]> {
  const rows = await db.project.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { milestones: { where: { deletedAt: null }, orderBy: { order: "asc" } } },
  });
  return rows.map(toProjectView);
}

export async function listProjectFilesMeta(): Promise<ProjectFileMeta[]> {
  return db.projectFile.findMany({
    where: { deletedAt: null },
    select: { id: true, projectId: true, name: true, mimeType: true, size: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listProjectLinksAll(): Promise<ProjectLinkItem[]> {
  const rows = await db.projectLink.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    label: r.label,
    url: r.url,
    type: r.type as ProjectLinkItem["type"],
    username: r.username,
    secret: r.secret,
    notes: r.notes,
    createdAt: r.createdAt,
  }));
}

export async function listProjectFeedbackAll(): Promise<ProjectFeedbackItem[]> {
  return db.projectFeedback.findMany({
    where: { deletedAt: null },
    select: { id: true, projectId: true, message: true, from: true, release: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProjectFileForDownload(
  id: string,
): Promise<{ name: string; mimeType: string; data: Uint8Array } | null> {
  return db.projectFile.findFirst({
    where: { id, deletedAt: null },
    select: { name: true, mimeType: true, data: true },
  });
}
