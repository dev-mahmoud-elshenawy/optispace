import "server-only";
import { db } from "@/lib/db";
import { toProjectView, type ProjectView } from "./service";

export async function listProjects(): Promise<ProjectView[]> {
  const rows = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { milestones: { orderBy: { order: "asc" } } },
  });
  return rows.map(toProjectView);
}
