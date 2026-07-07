import "server-only";
import { db } from "@/lib/db";
import { toProjectView, type ProjectFileMeta, type ProjectView } from "./service";

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

export async function getProjectFileForDownload(
  id: string,
): Promise<{ name: string; mimeType: string; data: Uint8Array } | null> {
  return db.projectFile.findFirst({
    where: { id, deletedAt: null },
    select: { name: true, mimeType: true, data: true },
  });
}
