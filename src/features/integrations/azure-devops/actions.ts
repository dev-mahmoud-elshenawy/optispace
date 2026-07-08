"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { serializeTags } from "@/types";

import { fetchAssignedWorkItems, getAzureDevOpsConfig } from "./service";

const SOURCE = "azure_devops";

export type SyncResult = { ok: true; imported: number; updated: number } | { ok: false; error: string };

// Import work items assigned to me into Tasks. Sync owns title/description/status/
// externalUrl; user-owned fields (priority, tags beyond project, dueDate, projectId)
// are left untouched on update. Never deletes local tasks.
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

  let imported = 0;
  let updated = 0;
  for (const item of items) {
    const existing = await db.task.findUnique({
      where: { source_externalId: { source: SOURCE, externalId: item.externalId } },
      select: { id: true },
    });
    if (existing) {
      await db.task.update({
        where: { id: existing.id },
        data: { title: item.title, description: item.description, status: item.status, externalUrl: item.url },
      });
      updated += 1;
    } else {
      await db.task.create({
        data: {
          title: item.title,
          description: item.description,
          status: item.status,
          priority: "medium",
          tags: serializeTags([item.project]),
          recurrence: "none",
          order: 0,
          source: SOURCE,
          externalId: item.externalId,
          externalUrl: item.url,
        },
      });
      imported += 1;
    }
  }

  if (imported > 0 || updated > 0) {
    revalidatePath("/tasks");
    revalidatePath("/");
  }
  return { ok: true, imported, updated };
}
