"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";

import type { TaskStatus } from "@/types";

import {
  fetchAssignedWorkItems,
  fetchWorkItemDetail,
  getAzureDevOpsConfig,
  postComment,
  statusForState,
  updateWorkItem,
  type WorkItemDetail,
} from "./service";

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
        data: { title: item.title, description: item.description, status: item.status, externalUrl: item.url, projectId, tags: "[]" },
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

export type DetailResult = { ok: true; detail: WorkItemDetail } | { ok: false; error: string };

// On-demand: load a synced work item's full detail (description + comments + attachments).
export async function getAzureDevOpsTaskDetail(externalId: string): Promise<DetailResult> {
  try {
    const detail = await fetchWorkItemDetail(externalId);
    if (!detail) return { ok: false, error: "Azure DevOps is not configured." };
    return { ok: true, detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load work item details." };
  }
}

export type WriteResult = { ok: true } | { ok: false; error: string };

// Push a title/state edit to Azure DevOps, then mirror it onto the local task.
export async function updateAzureDevOpsWorkItem(
  externalId: string,
  rev: number,
  patch: { title?: string; state?: string },
  meta: { project: string; type: string },
): Promise<WriteResult> {
  try {
    await updateWorkItem(externalId, rev, patch);

    const data: { title?: string; status?: TaskStatus } = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.state !== undefined) {
      const status = await statusForState(meta.project, meta.type, patch.state);
      if (status) data.status = status;
    }
    if (Object.keys(data).length > 0) {
      await db.task.updateMany({ where: { source: SOURCE, externalId }, data });
    }

    revalidatePath("/tasks");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Update failed." };
  }
}

export async function addAzureDevOpsComment(externalId: string, project: string, text: string): Promise<WriteResult> {
  if (!text.trim()) return { ok: false, error: "Comment is empty." };
  try {
    await postComment(project, externalId, text.trim());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Comment failed." };
  }
}
