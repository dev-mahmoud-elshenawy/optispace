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

export type SyncResult = { ok: true; imported: number; updated: number; pruned: number } | { ok: false; error: string };

// Import work items assigned to me into Tasks. Each ADO project maps to a Development
// project; the task is linked via projectId. Sync owns title/description/status/
// externalUrl/projectId; user-owned fields (priority, tags, dueDate) are left untouched
// on update. Never deletes local tasks.
export async function syncAzureDevOps(): Promise<SyncResult> {
  const config = getAzureDevOpsConfig();
  if (!config) {
    return { ok: false, error: "Azure DevOps is not configured. Set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT in .env." };
  }

  let fetched;
  try {
    fetched = await fetchAssignedWorkItems(config);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Azure DevOps sync failed." };
  }
  const { items, openIds, doneIds } = fetched;

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

  // Prune: synced tasks no longer in the open/assigned set (completed, removed, or
  // reassigned) are soft-deleted so the board mirrors current DevOps work. Only when
  // syncing all projects — a project subset can't tell "gone" from "not fetched".
  let pruned = 0;
  if (config.projects.length === 0) {
    const openSet = new Set(openIds);
    const doneSet = new Set(doneIds);
    const synced = await db.task.findMany({
      where: { source: SOURCE, deletedAt: null },
      select: { id: true, externalId: true },
    });
    const stale = synced
      .filter((t) => t.externalId && (!openSet.has(t.externalId) || doneSet.has(t.externalId)))
      .map((t) => t.id);
    if (stale.length > 0) {
      await db.task.updateMany({ where: { id: { in: stale } }, data: { deletedAt: new Date() } });
      pruned = stale.length;
    }
  }

  if (imported > 0 || updated > 0 || pruned > 0) {
    revalidatePath("/tasks");
    revalidatePath("/projects");
    revalidatePath("/");
  }
  return { ok: true, imported, updated, pruned };
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

export type WorkItemPatch = {
  title?: string;
  state?: string;
  description?: string;
  priority?: string;
  effort?: string;
  originalEstimate?: string;
  remainingWork?: string;
  completedWork?: string;
  iterationPath?: string;
  assignedTo?: string; // email/UPN; "" clears
};

const FIELD_MAP: Record<keyof WorkItemPatch, string> = {
  title: "System.Title",
  state: "System.State",
  description: "System.Description",
  priority: "Microsoft.VSTS.Common.Priority",
  effort: "Microsoft.VSTS.Scheduling.Effort",
  originalEstimate: "Microsoft.VSTS.Scheduling.OriginalEstimate",
  remainingWork: "Microsoft.VSTS.Scheduling.RemainingWork",
  completedWork: "Microsoft.VSTS.Scheduling.CompletedWork",
  iterationPath: "System.IterationPath",
  assignedTo: "System.AssignedTo",
};

const NUMERIC_KEYS = new Set<keyof WorkItemPatch>(["priority", "effort", "originalEstimate", "remainingWork", "completedWork"]);

// Push any set of edited fields to Azure DevOps, then mirror the ones OptiSpace
// tracks (title/description/status) onto the local task.
export async function updateAzureDevOpsWorkItem(
  externalId: string,
  rev: number,
  patch: WorkItemPatch,
  meta: { project: string; type: string },
): Promise<WriteResult> {
  try {
    const fields: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as (keyof WorkItemPatch)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      fields[FIELD_MAP[key]] = NUMERIC_KEYS.has(key) ? (value === "" ? null : Number(value)) : value;
    }
    if (Object.keys(fields).length > 0) {
      await updateWorkItem(externalId, rev, fields);
    }

    const data: { title?: string; description?: string | null; status?: TaskStatus } = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description || null;
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
