"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";

import { recordNotifications } from "@/features/notifications/actions";
import type { NotificationEvent } from "@/features/notifications/service";
import { STATUS_LABELS } from "@/features/tasks/service";
import type { TaskStatus } from "@/types";

import {
  createWorkItem,
  fetchAssignedWorkItems,
  fetchAssignmentInfo,
  fetchAzureDevOpsProjects,
  fetchIterations,
  fetchMentionCandidates,
  fetchRawComments,
  fetchWorkItemDetail,
  fetchWorkItemTypes,
  getAzureDevOpsConfig,
  postComment,
  resolveMe,
  searchIdentities,
  statusForState,
  fetchWorkItemUpdates,
  updateWorkItem,
  type WorkItemUpdateView,
  type WorkItemDetail,
} from "./service";
import type { AdoIdentity } from "./types";

// ── Config (Settings-managed, DB-backed — no .env) ───────────────────────────
export interface AdoConfigView {
  configured: boolean; // org URL + PAT both set
  orgUrl: string;
  patSet: boolean; // whether a PAT is stored (never returned in the clear)
  email: string;
  projects: string; // "all" or comma-separated names
  includeDone: boolean;
}

export async function getAdoConfig(): Promise<AdoConfigView> {
  const row = await db.adoConfig.findUnique({ where: { id: "singleton" } });
  return {
    configured: !!(row?.orgUrl?.trim() && row?.pat?.trim()),
    orgUrl: row?.orgUrl ?? "",
    patSet: !!row?.pat,
    email: row?.email ?? "",
    projects: row?.projects ?? "",
    includeDone: row?.includeDone ?? false,
  };
}

export interface SaveAdoConfigInput {
  orgUrl: string;
  pat: string; // blank = keep the stored PAT
  email: string;
  projects: string;
  includeDone: boolean;
}

export async function saveAdoConfig(input: SaveAdoConfigInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const orgUrl = input.orgUrl.trim();
  if (!orgUrl) return { ok: false, error: "Organization URL is required." };
  const existing = await db.adoConfig.findUnique({ where: { id: "singleton" } });
  const pat = input.pat.trim() || existing?.pat || "";
  if (!pat) return { ok: false, error: "A Personal Access Token is required." };
  const data = {
    orgUrl,
    pat,
    email: input.email.trim() || null,
    projects: input.projects.trim(),
    includeDone: input.includeDone,
  };
  await db.adoConfig.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  revalidatePath("/settings");
  revalidatePath("/tasks");
  return { ok: true };
}

export async function clearAdoConfig(): Promise<{ ok: true }> {
  await db.adoConfig.deleteMany({ where: { id: "singleton" } });
  revalidatePath("/settings");
  revalidatePath("/tasks");
  return { ok: true };
}

const SOURCE = "azure_devops";
const MENTION_LOOKBACK_DAYS = 14; // only notify for comments newer than this — avoids a
// first-run flood of ancient mentions once mention detection ships.

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Flatten a (possibly Aggregate) error into a searchable string: message + code + nested causes.
// A Node AggregateError from multiple failed connect attempts has an EMPTY .message — the real
// ETIMEDOUT/EHOSTUNREACH codes live on .code and .errors[].code, so matching .message alone misses them.
function flattenError(error: unknown): string {
  const parts: string[] = [];
  const visit = (e: unknown) => {
    if (!e || typeof e !== "object") {
      if (e != null) parts.push(String(e));
      return;
    }
    const o = e as { message?: unknown; code?: unknown; errors?: unknown };
    if (typeof o.message === "string") parts.push(o.message);
    if (typeof o.code === "string") parts.push(o.code);
    if (Array.isArray(o.errors)) for (const sub of o.errors) visit(sub);
  };
  visit(error);
  return parts.join(" ").trim();
}

export type SyncResult =
  | { ok: true; imported: number; updated: number; pruned: number; notified: number }
  | { ok: false; error: string };

// Import work items assigned to me into Tasks. Each ADO project maps to a Development
// project; the task is linked via projectId. Sync owns title/description/status/
// externalUrl/projectId; user-owned fields (priority, tags, dueDate) are left untouched
// on update. Never deletes local tasks.
// Record sync health on the AdoConfig singleton (shown in Settings): lastSyncedAt on success
// (clears lastError); lastError on failure. updateMany no-ops when unconfigured (no row).
async function recordAdoHealth(error: string | null): Promise<void> {
  await db.adoConfig.updateMany({
    where: { id: "singleton" },
    data: error === null ? { lastSyncedAt: new Date(), lastError: null } : { lastError: error },
  });
}

export async function syncAzureDevOps(): Promise<SyncResult> {
  const result = await runAzureDevOpsSync();
  await recordAdoHealth(result.ok ? null : result.error);
  return result;
}

async function runAzureDevOpsSync(): Promise<SyncResult> {
  const config = await getAzureDevOpsConfig();
  if (!config) {
    return { ok: false, error: "Azure DevOps is not configured. Set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT in .env." };
  }

  // Refresh the cached project list (best-effort — a failure here must not abort the
  // task sync). Keeps the "create in DevOps" picker current.
  await syncAzureDevOpsProjects().catch(() => 0);

  let fetched;
  try {
    fetched = await fetchAssignedWorkItems(config);
  } catch (error) {
    // Surface the REAL cause instead of swallowing it — a bare "sync failed" hid
    // whether this is a network timeout, a 401 (expired/invalid PAT), or a 404
    // (wrong org URL). Log the full error to the terminal and return a message
    // that names the likely fix.
    const detail = flattenError(error);
    const status = (error as { statusCode?: number })?.statusCode;
    const isAuth = status === 401 || status === 203 || /unauthor|401|invalid.*(token|pat)|TF400813/i.test(detail);
    const isNetwork = /ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|fetch failed/i.test(detail);
    if (isNetwork && !isAuth) {
      // Transient (offline / VPN down) — a one-line warning, not a full AggregateError dump on every poll.
      console.warn("[optispace] Azure DevOps sync skipped — can't reach the server (offline or VPN down?)");
      return { ok: false, error: "Couldn't reach Azure DevOps (network). Check your connection / VPN and try again." };
    }
    // Surface the REAL cause instead of swallowing it — distinguishes a 401 (expired/invalid PAT)
    // or a 404 (wrong org URL) from anything else.
    console.error("[optispace] Azure DevOps sync failed", error);
    let hint = detail || "Azure DevOps sync failed.";
    if (isAuth) {
      hint = "Azure DevOps rejected the PAT (likely expired or wrong scope). Regenerate AZURE_DEVOPS_PAT and restart.";
    }
    return { ok: false, error: hint };
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

  const events: NotificationEvent[] = [];
  // Resolve me once (GUID + display name) — used to attribute assignments/mentions
  // and to make sure my own name never shows as the actor.
  const me = await resolveMe().catch(() => null);

  // Pre-load all existing synced tasks in ONE query (was a per-item findUnique — N reads).
  const existingList = await db.task.findMany({
    where: { source: SOURCE, externalId: { in: items.map((i) => i.externalId) } },
    select: { id: true, externalId: true, deletedAt: true, status: true, changedDate: true },
  });
  const existingByExternalId = new Map(existingList.map((t) => [t.externalId, t] as const));
  const lookbackCutoff = Date.now() - MENTION_LOOKBACK_DAYS * 86_400_000;
  // Assignment-info needs a per-item ADO getUpdates call — collect candidates here and
  // fetch them in parallel (chunked) after the write loop instead of one serial call each.
  const assignmentCandidates: typeof items = [];

  let imported = 0;
  let updated = 0;
  for (const item of items) {
    const projectId = await resolveProjectId(item.project);
    const existing = existingByExternalId.get(item.externalId) ?? null;
    // A previously pruned (soft-deleted) task that's back in the @Me set is a
    // reassignment, not a routine update — restore it and notify like a new import.
    // Without this, `existing` still matches by (source, externalId), the code fell
    // into the update branch, deletedAt was never cleared, and no notification fired.
    const reassigned = existing?.deletedAt != null;
    const changedMs = item.changedDate ? new Date(item.changedDate).getTime() : 0;
    const storedChangedMs = existing?.changedDate ? new Date(existing.changedDate).getTime() : 0;
    if (existing && !reassigned) {
      // Only a bucket-crossing change (todo/in_progress/done) is visible to the user
      // on the board, so that's the only kind worth a notification — two different
      // ADO states that both map to the same bucket wouldn't look like anything changed.
      const statusChanged = existing.status !== item.status;
      await db.task.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          description: item.description,
          status: item.status,
          adoState: item.state,
          priority: item.priority,
          adoPriority: item.adoPriority,
          externalUrl: item.url,
          workItemType: item.workItemType,
          iterationPath: item.iterationPath,
          effort: item.effort,
          changedDate: item.changedDate ? new Date(item.changedDate) : null,
          projectId,
        },
      });
      updated += 1;
      if (statusChanged) {
        if (changedMs >= lookbackCutoff) {
          events.push({
            type: "status_changed",
            externalId: item.externalId,
            title: item.title,
            url: item.url,
            message: `Moved to ${STATUS_LABELS[item.status]}`,
            project: item.project,
            actor: item.changedBy && item.changedBy !== me?.displayName ? item.changedBy : null,
            occurredAt: item.changedDate,
            dedupeKey: `status:${item.externalId}:${changedMs}`,
          });
        }
      }
    } else {
      const taskData = {
        title: item.title,
        description: item.description,
        status: item.status,
        adoState: item.state,
        priority: item.priority,
        adoPriority: item.adoPriority,
        externalUrl: item.url,
        workItemType: item.workItemType,
        iterationPath: item.iterationPath,
        effort: item.effort,
        changedDate: item.changedDate ? new Date(item.changedDate) : null,
        projectId,
      };
      if (reassigned && existing) {
        await db.task.update({ where: { id: existing.id }, data: { ...taskData, deletedAt: null } });
      } else {
        await db.task.create({
          data: { ...taskData, order: 0, source: SOURCE, externalId: item.externalId },
        });
      }
      imported += 1;
    }

    // Assignment detection — NOT tied to the create branch. An item is worth an
    // assignment check when it's new-to-local (first import or a restored reassign)
    // OR it's an existing task whose changedDate advanced since we last stored it
    // (something changed in ADO). "New to my synced set" does NOT mean "newly
    // assigned to me" — a reopen or a field edit also bumps changedDate — so verify
    // against ADO's update history (fetchAssignmentInfo): only notify if
    // System.AssignedTo actually changed TO me recently, using the REAL assigner
    // from that revision (not `changedBy`, any last editor). The `changedMs` /
    // `storedChangedMs` gate keeps the extra getUpdates call off unchanged backlog
    // items, so steady-state syncs stay cheap. Deduped by the real assignment time,
    // so re-syncing a still-changing item never re-notifies the same assignment.
    const isNewToLocal = !existing || reassigned;
    const changedSinceStored = changedMs > storedChangedMs;
    if (me && changedMs >= lookbackCutoff && (isNewToLocal || changedSinceStored)) {
      assignmentCandidates.push(item);
    }
  }

  // Fetch assignment history for all candidates in parallel, in bounded chunks so a busy
  // sync never fires hundreds of ADO getUpdates calls at once (was one serial call per item).
  if (me) {
    const ASSIGN_CHUNK = 8;
    for (let i = 0; i < assignmentCandidates.length; i += ASSIGN_CHUNK) {
      const chunk = assignmentCandidates.slice(i, i + ASSIGN_CHUNK);
      const infos = await Promise.all(chunk.map((it) => fetchAssignmentInfo(it.externalId, me).catch(() => null)));
      infos.forEach((info, j) => {
        if (!info) return;
        const it = chunk[j];
        const assignedMs = new Date(info.assignedAt).getTime();
        if (assignedMs < lookbackCutoff) return;
        events.push({
          type: "assigned",
          externalId: it.externalId,
          title: it.title,
          url: it.url,
          message: "Assigned to you",
          project: it.project,
          actor: info.assignedBy,
          occurredAt: info.assignedAt,
          // Keyed by the real assignment time, so a genuine reassign-away-then-back
          // cycle isn't deduped against the original assignment.
          dedupeKey: `assigned:${it.externalId}:${assignedMs}`,
        });
      });
    }
  }

  // Mention detection. Candidates come from a history-search across ANY assignee
  // (not just items assigned to me) so mentions on other people's work items are
  // caught — that's the common case that Outlook emails you about. Bounded to the
  // lookback window to avoid a first-run flood; each candidate's comments are then
  // confirmed to contain my real data-vss-mention GUID (filters plain-name matches).
  try {
    if (me) {
      const cutoff = Date.now() - MENTION_LOOKBACK_DAYS * 86_400_000;
      const mentionTag = `data-vss-mention="version:2.0,${me.id}`.toLowerCase();
      const candidates = await fetchMentionCandidates(me.displayName, MENTION_LOOKBACK_DAYS);
      for (const candidate of candidates) {
        try {
          const comments = await fetchRawComments(candidate.project, candidate.externalId);
          for (const comment of comments) {
            if (!comment.createdDate) continue;
            if (new Date(comment.createdDate).getTime() < cutoff) continue;
            if (!comment.textRaw.toLowerCase().includes(mentionTag)) continue;
            events.push({
              type: "mentioned",
              externalId: candidate.externalId,
              title: candidate.title,
              url: candidate.url,
              message: stripHtml(comment.textRaw),
              project: candidate.project,
              // Who mentioned me — never attribute my own name.
              actor: comment.author && comment.author !== me.displayName ? comment.author : null,
              occurredAt: comment.createdDate,
              dedupeKey: `mention:${candidate.externalId}:${comment.id}`,
            });
          }
        } catch {
          // A single item's comment fetch failing must not abort the sync.
        }
      }
    }
  } catch {
    // Identity/candidate resolution failing → skip mentions this run, keep assignments.
  }

  let notified = 0;
  if (events.length > 0) {
    notified = await recordNotifications(events);
    if (notified > 0) revalidatePath("/notifications");
  }

  // Prune: synced tasks no longer in the open/assigned set (completed, removed, or
  // reassigned) are soft-deleted so the board mirrors current DevOps work. Only when
  // syncing all projects — a project subset can't tell "gone" from "not fetched".
  // Fail-safe: an empty openIds set is ambiguous — could mean "you have zero open
  // assigned items" or a transient WIQL/identity/permission hiccup that returned no
  // rows without erroring. Treat it as inconclusive and skip pruning rather than
  // risk soft-deleting every synced task on a fluke empty response.
  let pruned = 0;
  if (config.allProjects && openIds.length > 0) {
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
  }
  if (imported > 0 || updated > 0 || pruned > 0 || notified > 0) {
    revalidatePath("/"); // dashboard widget
  }
  return { ok: true, imported, updated, pruned, notified };
}

export type DetailResult = { ok: true; detail: WorkItemDetail } | { ok: false; error: string };

// On-demand: load a synced work item's full detail (description + comments + attachments).
export async function getAzureDevOpsTaskDetail(externalId: string): Promise<DetailResult> {
  try {
    const detail = await fetchWorkItemDetail(externalId);
    if (!detail) return { ok: false, error: "Azure DevOps is not configured, or this work item could not be found." };
    return { ok: true, detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load work item details." };
  }
}

// ── Create in Azure DevOps ─────────────────────────────────────────────────
// Refresh the cached project list from ADO — add new, restore returning, soft-delete
// ones that left the accessible set. Called on each sync and on a cold cache.
export async function syncAzureDevOpsProjects(): Promise<number> {
  const names = await fetchAzureDevOpsProjects();
  if (names.length === 0) return 0;
  for (const name of names) {
    const existing = await db.adoProject.findFirst({ where: { name }, select: { id: true, deletedAt: true } });
    if (existing) {
      if (existing.deletedAt) await db.adoProject.update({ where: { id: existing.id }, data: { deletedAt: null } });
    } else {
      await db.adoProject.create({ data: { name } });
    }
  }
  await db.adoProject.updateMany({ where: { deletedAt: null, name: { notIn: names } }, data: { deletedAt: new Date() } });
  return names.length;
}

// Populate the "new DevOps task" dialog. Projects come from the DB cache (instant);
// a cold cache triggers a one-time sync. Types/iterations are fetched live per project.
export async function getAzureDevOpsProjects(): Promise<string[]> {
  const read = async () =>
    (await db.adoProject.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { name: true } })).map((p) => p.name);
  const cached = await read();
  if (cached.length > 0) return cached;
  await syncAzureDevOpsProjects();
  return read();
}

export async function getAzureDevOpsWorkItemTypes(project: string): Promise<string[]> {
  if (!project) return [];
  return fetchWorkItemTypes(project);
}

export async function getAzureDevOpsIterations(project: string): Promise<string[]> {
  if (!project) return [];
  return fetchIterations(project);
}

export type CreateWorkItemInput = {
  project: string;
  type: string;
  title: string;
  description?: string;
  priority?: string;
  iterationPath?: string;
  assignee?: string;
};

// Create a work item in ADO (assigned to me) and mirror it into a local Task so it
// shows on the board immediately — same shape the sync would produce.
export async function createAzureDevOpsTask(input: CreateWorkItemInput): Promise<WriteResult> {
  if (!input.project || !input.type || !input.title.trim()) {
    return { ok: false, error: "Project, type and title are required." };
  }
  try {
    const item = await createWorkItem({
      project: input.project,
      type: input.type,
      title: input.title.trim(),
      description: input.description ?? "",
      priority: input.priority,
      iterationPath: input.iterationPath,
      assignee: input.assignee,
    });

    // Resolve (or create) the local Development project mirroring the ADO project.
    const existingProject = await db.project.findFirst({ where: { name: item.project, deletedAt: null }, select: { id: true } });
    const projectId =
      existingProject?.id ??
      (
        await db.project.create({
          data: { name: item.project, platform: "web", status: "active", notes: "Synced from Azure DevOps." },
          select: { id: true },
        })
      ).id;

    await db.task.create({
      data: {
        title: item.title,
        description: item.description,
        status: item.status,
        adoState: item.state,
        priority: item.priority,
        adoPriority: item.adoPriority,
        order: 0,
        source: SOURCE,
        externalId: item.externalId,
        externalUrl: item.url,
        workItemType: item.workItemType,
        iterationPath: item.iterationPath,
        effort: item.effort,
        changedDate: item.changedDate ? new Date(item.changedDate) : null,
        projectId,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to create the work item." };
  }
}

export type WriteResult = { ok: true; rev?: number } | { ok: false; error: string };

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
    let newRev = rev;
    if (Object.keys(fields).length > 0) {
      newRev = await updateWorkItem(externalId, rev, fields);
    }

    const data: { title?: string; description?: string | null; status?: TaskStatus; adoState?: string; iterationPath?: string | null } = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description || null;
    if (patch.iterationPath !== undefined) data.iterationPath = patch.iterationPath || null;
    // Closing = hide now. If the new ADO state is a done category (Closed/Completed/
    // Resolved), soft-delete the local task immediately instead of leaving it in the Done
    // column until the next poll prunes it — ADO owns done items, the sync drops them anyway.
    let hide = false;
    if (patch.state !== undefined) {
      data.adoState = patch.state; // reflect the real ADO state in the list
      const status = await statusForState(meta.project, meta.type, patch.state);
      if (status === "done") hide = true;
      else if (status) data.status = status;
    }
    if (hide) {
      await db.task.updateMany({ where: { source: SOURCE, externalId }, data: { ...data, deletedAt: new Date() } });
    } else if (Object.keys(data).length > 0) {
      await db.task.updateMany({ where: { source: SOURCE, externalId }, data });
    }

    revalidatePath("/tasks");
    revalidatePath("/");
    return { ok: true, rev: newRev };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Update failed." };
  }
}

// DevOps-style History: field-change revisions + discussion comments, newest first.
// Config-gated (empty when ADO isn't set up). Lazy-loaded by the detail modal.
export async function getAzureDevOpsWorkItemUpdates(externalId: string): Promise<WorkItemUpdateView[]> {
  if (!(await getAzureDevOpsConfig())) return [];
  try {
    return await fetchWorkItemUpdates(externalId);
  } catch {
    return [];
  }
}

// @-mention autocomplete: search ADO users by the typed query. Config-gated,
// returns [] when ADO isn't set up so the suggestion box just stays empty.
export async function searchAzureDevOpsIdentities(query: string): Promise<AdoIdentity[]> {
  if (!(await getAzureDevOpsConfig())) return [];
  try {
    return await searchIdentities(query);
  } catch {
    return [];
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
