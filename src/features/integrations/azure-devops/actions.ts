"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";

import { fetchAssignedWorkItems, getAzureDevOpsConfig } from "./service";

const SOURCE = "azure_devops";

export type SyncResult = { ok: true; imported: number; updated: number } | { ok: false; error: string };

// Import work items assigned to me into Tasks. Each ADO project maps to a Development
// project; the task is linked via projectId. Sync owns title/description/status/
// externalUrl/projectId; user-owned fields (priority, tags, dueDate) are left untouched
// on update. Never deletes local tasks.
export async function syncAzureDevOps(): Promise<SyncResult> {
  const config = getAzureDevOpsConfig();
  if (!config) {
    return { ok: false, error: "Azure DevOps is not configured. Set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT in .env." };
  }

  let items;
  try {
    items = await fetchAssignedWorkItems(config);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Azure DevOps sync failed." };
  }

  // Resolve (or create) a Development project per ADO project, cached per sync.
  const projectIds = new Map<string, string>();
  async function resolveProjectId(name: string): Promise<string> {
    const cached = projectIds.get(name);
    if (cached) return cached;
    const found = await db.project.findFirst({ where: { name, deletedAt: null }, select: { id: true } });
    const id =
      found?.id ??
      (
        await db.project.create({
          data: { name, platform: "web", status: "active", notes: "Synced from Azure DevOps." },
          select: { id: true },
        })
      ).id;
    projectIds.set(name, id);
    return id;
  }

  let imported = 0;
  let updated = 0;
  for (const item of items) {
    const projectId = await resolveProjectId(item.project);
    const existing = await db.task.findUnique({
      where: { source_externalId: { source: SOURCE, externalId: item.externalId } },
      select: { id: true },
    });
    if (existing) {
      await db.task.update({
        where: { id: existing.id },
        data: { title: item.title, description: item.description, status: item.status, externalUrl: item.url, projectId },
      });
      updated += 1;
    } else {
      await db.task.create({
        data: {
          title: item.title,
          description: item.description,
          status: item.status,
          priority: "medium",
          tags: "[]",
          recurrence: "none",
          order: 0,
          source: SOURCE,
          externalId: item.externalId,
          externalUrl: item.url,
          projectId,
        },
      });
      imported += 1;
    }
  }

  if (imported > 0 || updated > 0) {
    revalidatePath("/tasks");
    revalidatePath("/projects");
    revalidatePath("/");
  }
  return { ok: true, imported, updated };
}
