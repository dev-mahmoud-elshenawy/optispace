import "server-only";

import * as azdev from "azure-devops-node-api";
import type { ICoreApi } from "azure-devops-node-api/CoreApi";
import type { IWorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import {
  TreeStructureGroup,
  WorkItemExpand,
  type WorkItem,
  type WorkItemClassificationNode,
  type WorkItemUpdate,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import { Operation, type JsonPatchDocument } from "azure-devops-node-api/interfaces/common/VSSInterfaces";
import DOMPurify from "isomorphic-dompurify";

import { db } from "@/lib/db";
import type { TaskPriority, TaskStatus } from "@/types";

import type { AdoIdentity } from "./types";

// ── Config (set in Settings, stored in the DB — no .env) ─────────────────────
export interface AzureDevOpsConfig {
  orgUrl: string;
  pat: string;
  email: string | null;
  allProjects: boolean; // projects = "all" → every accessible project
  projects: string[]; // explicit project names (ignored when allProjects)
  includeDone: boolean;
}

export async function getAzureDevOpsConfig(): Promise<AzureDevOpsConfig | null> {
  const row = await db.adoConfig.findUnique({ where: { id: "singleton" } });
  if (!row) return null;
  const orgUrl = row.orgUrl?.trim();
  const pat = row.pat?.trim();
  if (!orgUrl || !pat) return null;
  // Explicit opt-in: projects = "all" syncs every project, a comma-separated list syncs
  // those, and blank syncs nothing (no implicit "blank = all" magic).
  const rawProjects = (row.projects ?? "").trim();
  return {
    orgUrl: orgUrl.replace(/\/+$/, ""),
    pat,
    email: row.email?.trim() || null,
    allProjects: rawProjects.toLowerCase() === "all",
    projects: rawProjects
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== "all"),
    includeDone: row.includeDone,
  };
}

export async function isAzureDevOpsEnabled(): Promise<boolean> {
  return (await getAzureDevOpsConfig()) !== null;
}

// ── SDK connection (azure-devops-node-api) ───────────────────────────────────
// Memoized WebApi + area clients, keyed by org+PAT so a config change rebuilds them.
// getXxxApi() does a one-time resource-location handshake the SDK caches internally.
let conn: { key: string; wit: Promise<IWorkItemTrackingApi>; core: Promise<ICoreApi> } | null = null;

async function apis(): Promise<{ wit: Promise<IWorkItemTrackingApi>; core: Promise<ICoreApi> } | null> {
  const config = await getAzureDevOpsConfig();
  if (!config) return null;
  const key = `${config.orgUrl}::${config.pat}`;
  if (!conn || conn.key !== key) {
    const webApi = new azdev.WebApi(config.orgUrl, azdev.getPersonalAccessTokenHandler(config.pat));
    conn = { key, wit: webApi.getWorkItemTrackingApi(), core: webApi.getCoreApi() };
  }
  return conn;
}

// The two calls the SDK does NOT cover cleanly still use fetch (documented at each):
// the Identity Picker (searchIdentities) and raw attachment bytes+content-type.
function authHeaders(pat: string): HeadersInit {
  return {
    Authorization: "Basic " + Buffer.from(":" + pat).toString("base64"),
    "Content-Type": "application/json",
  };
}

// Build the ADO web URL for a work item (SDK returns API urls, not the edit page).
function itemUrl(orgUrl: string, project: string, id: number | string): string {
  return `${orgUrl}/${encodeURIComponent(project)}/_workitems/edit/${id}`;
}

function fieldStr(fields: { [key: string]: unknown } | undefined, key: string): string {
  const v = fields?.[key];
  return v == null ? "" : String(v);
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === "string" ? d : new Date(d).toISOString();
}

// ── Fetch (read-only) ────────────────────────────────────────────────────────
export interface WorkItemDTO {
  externalId: string;
  title: string;
  description: string | null;
  status: TaskStatus; // collapsed 3-bucket for board/filter
  state: string; // raw ADO System.State (New/Active/Ready For Testing/…) for the list badge
  url: string;
  project: string;
  workItemType: string; // ADO System.WorkItemType (Bug/Task/User Story/…)
  priority: TaskPriority; // 3-level enum for filter/sort (collapsed from ADO 1–4)
  adoPriority: number | null; // raw ADO priority (1–4) for the card flag; null = unset
  iterationPath: string | null;
  effort: number | null; // estimated effort / original estimate; null = unestimated
  changedDate: string | null; // ADO System.ChangedDate (ISO)
  changedBy: string | null; // ADO System.ChangedBy display name (≈ who assigned it)
}

const CHUNK_SIZE = 200; // ADO caps work-item detail fetches at 200 ids/request
const MAX_CHUNKS = 25; // safety bound: at most CHUNK_SIZE*MAX_CHUNKS (5000) items per sync

const DETAIL_FIELD_KEYS = [
  "System.Title",
  "System.Description",
  "System.State",
  "System.WorkItemType",
  "System.TeamProject",
  "System.IterationPath",
  "System.ChangedDate",
  "System.ChangedBy",
  "Microsoft.VSTS.Common.Priority",
  "Microsoft.VSTS.Scheduling.Effort",
  "Microsoft.VSTS.Scheduling.OriginalEstimate",
];

// ADO priority is numeric (1 = highest … 4 = lowest). Collapse to the local 3-level
// enum: 1/2 → high, 3 → medium, 4 → low. Missing/unknown → medium.
function mapPriority(raw: unknown): TaskPriority {
  switch (String(raw ?? "").trim()) {
    case "1":
    case "2":
      return "high";
    case "4":
      return "low";
    default:
      return "medium";
  }
}

// Azure DevOps state category → OptiSpace status. Categories are stable across
// custom state names (New/Active/"Ready For Testing"/… all resolve by category).
function categoryToStatus(category: string): TaskStatus | null {
  switch (category) {
    case "Proposed":
      return "todo";
    case "InProgress":
      return "in_progress";
    case "Resolved":
    case "Completed":
      return "done";
    default:
      return null; // "Removed" or unknown → skip
  }
}

// Fallback when the states API can't be read for a type.
function nameHeuristic(state: string): TaskStatus {
  const s = state.toLowerCase();
  if (/(done|closed|complete|resolved)/.test(s)) return "done";
  if (/(active|progress|doing|review|testing)/.test(s)) return "in_progress";
  return "todo";
}

export interface AssignedWorkItems {
  items: WorkItemDTO[]; // open items to import (capped)
  openIds: string[]; // every not-Removed assigned id (uncapped) — for pruning
  doneIds: string[]; // ids in the fetched batch that are done — for pruning
}

export async function fetchAssignedWorkItems(config: AzureDevOpsConfig): Promise<AssignedWorkItems> {
  const c = await apis();
  if (!c) return { items: [], openIds: [], doneIds: [] };
  // Blank config (not "all", no explicit projects) syncs nothing — explicit opt-in.
  if (!config.allProjects && config.projects.length === 0) return { items: [], openIds: [], doneIds: [] };
  const wit = await c.wit;

  const projectFilter = config.allProjects
    ? ""
    : ` AND [System.TeamProject] IN (${config.projects.map((p) => `'${p.replace(/'/g, "''")}'`).join(", ")})`;
  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.State] <> 'Removed'${projectFilter} ORDER BY [System.ChangedDate] DESC`;

  const result = await wit.queryByWiql({ query });
  const openIds = (result.workItems ?? []).map((w) => String(w.id));
  if (openIds.length === 0) return { items: [], openIds, doneIds: [] };

  // Fetch details for ALL assigned ids in chunks (ADO caps 200 ids/request). A single
  // 200-item cap starved older open items whenever the assignee had many non-Removed
  // (incl. closed) items — they fell past the cap and never re-synced. See BATCH_PROCESSING.
  const numericIds = openIds.slice(0, CHUNK_SIZE * MAX_CHUNKS).map((id) => Number(id));
  const detail: WorkItem[] = [];
  for (let i = 0; i < numericIds.length; i += CHUNK_SIZE) {
    const chunk = numericIds.slice(i, i + CHUNK_SIZE);
    const batch = await wit.getWorkItems(chunk, DETAIL_FIELD_KEYS);
    detail.push(...batch);
  }

  // Resolve state → category per (project, type), cached.
  const stateMaps = new Map<string, Record<string, string>>();
  async function statesFor(project: string, type: string): Promise<Record<string, string>> {
    const key = `${project}|${type}`;
    const cached = stateMaps.get(key);
    if (cached) return cached;
    let map: Record<string, string> = {};
    try {
      const states = await wit.getWorkItemTypeStates(project, type);
      map = Object.fromEntries(states.map((s) => [s.name ?? "", s.category ?? ""]));
    } catch {
      map = {};
    }
    stateMaps.set(key, map);
    return map;
  }

  const items: WorkItemDTO[] = [];
  const doneIds: string[] = [];
  for (const wi of detail) {
    const f = wi.fields ?? {};
    const project = fieldStr(f, "System.TeamProject");
    const type = fieldStr(f, "System.WorkItemType");
    const state = fieldStr(f, "System.State");
    const category = (await statesFor(project, type))[state];
    const status = category ? categoryToStatus(category) : nameHeuristic(state);
    if (status === null) continue; // Removed/unknown category
    if (status === "done") {
      doneIds.push(String(wi.id));
      if (!config.includeDone) continue;
    }
    const effortRaw = f["Microsoft.VSTS.Scheduling.Effort"] ?? f["Microsoft.VSTS.Scheduling.OriginalEstimate"];
    const effort = effortRaw != null && effortRaw !== "" ? Number(effortRaw) : NaN;
    const priorityRaw = f["Microsoft.VSTS.Common.Priority"];
    const changedBy = (f["System.ChangedBy"] as { displayName?: string } | undefined)?.displayName ?? null;
    items.push({
      externalId: String(wi.id),
      title: fieldStr(f, "System.Title") || `Work item ${wi.id}`,
      description: (f["System.Description"] as string | undefined) ?? null,
      status,
      state,
      url: itemUrl(config.orgUrl, project, wi.id ?? 0),
      project,
      workItemType: type,
      priority: mapPriority(priorityRaw),
      adoPriority: priorityRaw ? Number(priorityRaw) : null,
      iterationPath: fieldStr(f, "System.IterationPath") || null,
      effort: Number.isFinite(effort) ? effort : null,
      changedDate: fieldStr(f, "System.ChangedDate") || null,
      changedBy,
    });
  }
  return { items, openIds, doneIds };
}

// Verify a real, recent assignment from the work item's update history — the ONLY
// reliable source. `changedDate`/`changedBy` reflect ANY edit (status, labels, a
// comment), so treating "new to my synced set" as "newly assigned to me" and
// `changedBy` as the assigner produced false "Assigned by X" notifications when
// someone merely changed status or reopened an old item. Instead: find the most
// recent update that actually set System.AssignedTo to me, and report who did it +
// when. Returns null if I was never assigned via an update we can see.
export async function fetchAssignmentInfo(
  externalId: string,
  me: { id: string; displayName: string },
): Promise<{ assignedBy: string | null; assignedAt: string } | null> {
  const c = await apis();
  if (!c) return null;
  const wit = await c.wit;
  let updates: WorkItemUpdate[];
  try {
    updates = await wit.getUpdates(Number(externalId));
  } catch {
    return null;
  }

  // No identity match on the update value — the WIQL that produced this item already
  // guarantees it's currently AssignedTo=@Me, so the most recent update that set a
  // non-empty System.AssignedTo IS when it became mine. Matching me.id/displayName
  // against the update's value was fragile (ADO returns that field in different
  // shapes) and silently dropped real assignments when the shapes didn't line up.
  for (let i = updates.length - 1; i >= 0; i--) {
    const f = updates[i].fields?.["System.AssignedTo"];
    if (!f || f.newValue == null || f.newValue === "") continue;
    const revisedBy = (updates[i].revisedBy as { displayName?: string } | undefined)?.displayName;
    const changedBy = updates[i].fields?.["System.ChangedBy"]?.newValue as { displayName?: string } | string | undefined;
    const assigner = revisedBy ?? (typeof changedBy === "string" ? changedBy : changedBy?.displayName) ?? null;
    const dateRaw = (updates[i].fields?.["System.ChangedDate"]?.newValue as string | Date | undefined) ?? updates[i].revisedDate;
    return {
      assignedBy: assigner && assigner !== me.displayName ? assigner : null,
      assignedAt: toIso(dateRaw) ?? new Date().toISOString(),
    };
  }
  return null;
}

// ── Detail (on-demand, for the task popup) ───────────────────────────────────
export interface WorkItemComment {
  author: string;
  text: string; // sanitized HTML
  date: string;
}

export interface WorkItemAttachment {
  id: string;
  name: string;
  isImage: boolean;
}

export interface WorkItemRef {
  id: string;
  title: string;
  type: string; // ADO work item type (Bug/Task/User Story/…) for the colored swatch
  state: string;
  url: string;
}

export interface WorkItemDetail {
  externalId: string;
  title: string;
  rev: number; // for optimistic-concurrency on write-back
  project: string;
  descriptionHtml: string | null;
  descriptionRaw: string; // for editing
  state: string;
  type: string;
  allowedStates: string[]; // valid states for this work item type (for the editor)
  // Editable current values (strings for form binding; "" = unset)
  priority: string;
  effort: string;
  originalEstimate: string;
  remainingWork: string;
  completedWork: string;
  iterationPath: string;
  assignedTo: string; // email/UPN
  iterations: string[]; // sprint options for this project
  details: { label: string; value: string }[]; // remaining read-only extras (story points, tags)
  url: string;
  comments: WorkItemComment[];
  attachments: WorkItemAttachment[];
  parent: WorkItemRef | null; // ADO hierarchy parent (Hierarchy-Reverse), if any
  children: WorkItemRef[]; // ADO hierarchy children (Hierarchy-Forward)
}

// Notable read-only work-item fields to surface below the editable form.
const DETAIL_FIELDS: { key: string; label: string; format: (v: unknown) => string }[] = [
  { key: "Microsoft.VSTS.Scheduling.StoryPoints", label: "Story points", format: String },
  { key: "System.Tags", label: "Tags", format: String },
];

// Sanitize third-party HTML with DOMPurify + a strict tag/attr allowlist. Shared with the
// GitHub PR detail view (GitHub's bodyHTML) — same allowlist, defense-in-depth on render.
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "i", "strong", "em", "u", "s", "ul", "ol", "li", "a", "code", "pre", "blockquote", "h1", "h2", "h3", "h4", "span", "div", "table", "thead", "tbody", "tr", "th", "td"],
    ALLOWED_ATTR: ["href", "title"],
    ALLOWED_URI_REGEXP: /^https?:/i,
  });
}

export async function fetchWorkItemDetail(externalId: string): Promise<WorkItemDetail | null> {
  const config = await getAzureDevOpsConfig();
  const c = await apis();
  if (!config || !c) return null;
  const wit = await c.wit;

  const wi = await wit.getWorkItem(Number(externalId), undefined, undefined, WorkItemExpand.All);
  if (!wi) return null; // deleted, or no longer visible to this PAT (permissions/project moved)
  const f = wi.fields ?? {};
  const project = fieldStr(f, "System.TeamProject");
  const type = fieldStr(f, "System.WorkItemType");
  const description = (f["System.Description"] as string | undefined) ?? null;
  const allowedStates = (await fetchStates(project, type)).map((s) => s.name);

  const details = DETAIL_FIELDS.flatMap(({ key, label, format }) => {
    const v = f[key];
    if (v === undefined || v === null || v === "") return [];
    return [{ label, value: format(v) }];
  });

  const relations = wi.relations ?? [];
  const attachments: WorkItemAttachment[] = relations
    .filter((r) => r.rel === "AttachedFile")
    .map((r) => {
      const id = (r.url ?? "").split("/").pop() ?? "";
      const name = (r.attributes?.name as string | undefined) ?? id;
      return { id, name, isImage: /\.(png|jpe?g|gif|webp|bmp)$/i.test(name) };
    });

  let comments: WorkItemComment[] = [];
  try {
    const list = await wit.getComments(project, Number(externalId));
    comments = (list.comments ?? []).map((x) => ({
      author: x.createdBy?.displayName ?? "Unknown",
      text: sanitizeHtml(x.text ?? ""),
      date: toIso(x.createdDate) ?? "",
    }));
  } catch {
    comments = [];
  }

  const iterations = await fetchIterations(project);
  const assignedTo = (f["System.AssignedTo"] as { uniqueName?: string } | undefined)?.uniqueName ?? "";

  // Hierarchy links: Reverse = parent, Forward = children. Resolve their titles/types
  // in one batch fetch so the popup can show the work-item tree.
  const relIdOf = (url: string | undefined) => (url ?? "").split("/").pop() ?? "";
  const parentUrl = relations.find((r) => r.rel === "System.LinkTypes.Hierarchy-Reverse")?.url ?? null;
  const childIds = relations.filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward").map((r) => relIdOf(r.url));
  const relIds = [...(parentUrl ? [relIdOf(parentUrl)] : []), ...childIds];
  const refById = new Map<string, WorkItemRef>();
  if (relIds.length > 0) {
    const refItems = await wit.getWorkItems(relIds.map(Number), ["System.Title", "System.WorkItemType", "System.State"]);
    for (const w of refItems) {
      const wf = w.fields ?? {};
      refById.set(String(w.id), {
        id: String(w.id),
        title: fieldStr(wf, "System.Title") || `Work item ${w.id}`,
        type: fieldStr(wf, "System.WorkItemType"),
        state: fieldStr(wf, "System.State"),
        url: itemUrl(config.orgUrl, project, w.id ?? 0),
      });
    }
  }
  const parent = parentUrl ? refById.get(relIdOf(parentUrl)) ?? null : null;
  const children = childIds.map((id) => refById.get(id)).filter((r): r is WorkItemRef => Boolean(r));

  return {
    externalId: String(externalId),
    title: fieldStr(f, "System.Title"),
    rev: wi.rev ?? 0,
    project,
    descriptionHtml: description ? sanitizeHtml(description) : null,
    descriptionRaw: description ?? "",
    state: fieldStr(f, "System.State"),
    type,
    allowedStates,
    priority: fieldStr(f, "Microsoft.VSTS.Common.Priority"),
    effort: fieldStr(f, "Microsoft.VSTS.Scheduling.Effort"),
    originalEstimate: fieldStr(f, "Microsoft.VSTS.Scheduling.OriginalEstimate"),
    remainingWork: fieldStr(f, "Microsoft.VSTS.Scheduling.RemainingWork"),
    completedWork: fieldStr(f, "Microsoft.VSTS.Scheduling.CompletedWork"),
    iterationPath: fieldStr(f, "System.IterationPath"),
    assignedTo,
    iterations,
    details,
    url: itemUrl(config.orgUrl, project, externalId),
    comments,
    attachments,
    parent,
    children,
  };
}

// ── Write-back ───────────────────────────────────────────────────────────────
export interface StateOption {
  name: string;
  category: string;
}

export async function fetchStates(project: string, type: string): Promise<StateOption[]> {
  const c = await apis();
  if (!c) return [];
  try {
    const states = await (await c.wit).getWorkItemTypeStates(project, type);
    return states.map((s) => ({ name: s.name ?? "", category: s.category ?? "" }));
  } catch {
    return [];
  }
}

// Maps an ADO state name back to our TaskStatus (for reflecting a write locally).
export async function statusForState(project: string, type: string, state: string): Promise<TaskStatus | null> {
  const match = (await fetchStates(project, type)).find((s) => s.name === state);
  return match ? categoryToStatus(match.category) : null;
}

// PATCH arbitrary fields (ADO field key → value) with optimistic concurrency
// (rev test → 412 if changed upstream). Empty-string values clear the field.
export async function updateWorkItem(externalId: string, rev: number, fields: Record<string, unknown>): Promise<void> {
  const c = await apis();
  if (!c) throw new Error("Azure DevOps is not configured.");
  const document: JsonPatchDocument = [
    { op: Operation.Test, path: "/rev", value: rev },
    ...Object.entries(fields).map(([key, value]) => ({ op: Operation.Add, path: `/fields/${key}`, value })),
  ];
  try {
    await (await c.wit).updateWorkItem({}, document, Number(externalId));
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 412) {
      throw new Error("This work item changed in Azure DevOps — reopen it and try again.");
    }
    throw new Error(`Azure DevOps update failed: ${e instanceof Error ? e.message : "unknown error"}.`);
  }
}

// Every project the PAT can access — independent of the @Me WIQL, so the create
// picker offers all projects, not just ones where I already have assigned work.
export async function fetchAzureDevOpsProjects(): Promise<string[]> {
  const c = await apis();
  if (!c) return [];
  const projects = await (await c.core).getProjects();
  return projects
    .map((p) => p.name ?? "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

// Work item type names for a project (Bug/Task/User Story/…), excluding disabled ones.
export async function fetchWorkItemTypes(project: string): Promise<string[]> {
  const c = await apis();
  if (!c) return [];
  const types = await (await c.wit).getWorkItemTypes(project);
  return types.filter((t) => !t.isDisabled).map((t) => t.name ?? "").filter(Boolean);
}

// Create a work item assigned to me and return it as a WorkItemDTO so the caller can
// mirror it into a local Task immediately. Needs a Work Items Read & Write PAT.
export async function createWorkItem(input: {
  project: string;
  type: string;
  title: string;
  description: string;
  priority?: string; // ADO numeric 1–4
  iterationPath?: string;
  assignee?: string; // email/UPN; defaults to me
}): Promise<WorkItemDTO> {
  const config = await getAzureDevOpsConfig();
  const c = await apis();
  if (!config || !c) throw new Error("Azure DevOps is not configured.");
  const assignee = input.assignee?.trim() || config.email || (await resolveMe())?.uniqueName || null;
  const ops: { op: Operation; path: string; value: unknown }[] = [
    { op: Operation.Add, path: "/fields/System.Title", value: input.title },
  ];
  if (input.description.trim()) ops.push({ op: Operation.Add, path: "/fields/System.Description", value: input.description });
  if (assignee) ops.push({ op: Operation.Add, path: "/fields/System.AssignedTo", value: assignee });
  if (input.priority?.trim()) ops.push({ op: Operation.Add, path: "/fields/Microsoft.VSTS.Common.Priority", value: Number(input.priority) });
  if (input.iterationPath?.trim()) ops.push({ op: Operation.Add, path: "/fields/System.IterationPath", value: input.iterationPath });

  const wi = await (await c.wit).createWorkItem({}, ops as unknown as JsonPatchDocument, input.project, input.type);
  const f = wi.fields ?? {};
  const state = fieldStr(f, "System.State");
  const priorityRaw = f["Microsoft.VSTS.Common.Priority"];
  return {
    externalId: String(wi.id),
    title: fieldStr(f, "System.Title") || input.title,
    description: (f["System.Description"] as string | undefined) ?? null,
    status: (await statusForState(input.project, input.type, state)) ?? "todo",
    state,
    url: itemUrl(config.orgUrl, input.project, wi.id ?? 0),
    project: input.project,
    workItemType: input.type,
    priority: mapPriority(priorityRaw),
    adoPriority: priorityRaw ? Number(priorityRaw) : null,
    iterationPath: fieldStr(f, "System.IterationPath") || null,
    effort: null,
    changedDate: fieldStr(f, "System.ChangedDate") || null,
    changedBy: null,
  };
}

// Iteration paths available in a project (for the sprint dropdown).
export async function fetchIterations(project: string): Promise<string[]> {
  const c = await apis();
  if (!c) return [];
  let root: WorkItemClassificationNode;
  try {
    root = await (await c.wit).getClassificationNode(project, TreeStructureGroup.Iterations, undefined, 5);
  } catch {
    return [];
  }
  const paths: string[] = [];
  const walk = (node: WorkItemClassificationNode, prefix: string) => {
    const name = node.name ?? "";
    const path = prefix ? `${prefix}\\${name}` : name;
    if (!node.hasChildren || (node.children?.length ?? 0) === 0) paths.push(path);
    node.children?.forEach((child) => walk(child, path));
  };
  walk(root, "");
  return paths;
}

export async function postComment(project: string, externalId: string, text: string): Promise<void> {
  const c = await apis();
  if (!c) throw new Error("Azure DevOps is not configured.");
  await (await c.wit).addComment({ text }, project, Number(externalId));
}

// Search ADO users for @-mention suggestions via the Identity Picker API.
// KEPT ON FETCH: azure-devops-node-api does not wrap the IdentityPicker service.
// Returns [] on any failure — a suggestion box degrades quietly, no throw.
export async function searchIdentities(query: string): Promise<AdoIdentity[]> {
  const config = await getAzureDevOpsConfig();
  const trimmed = query.trim();
  if (!config || trimmed.length === 0) return [];

  const res = await fetch(`${config.orgUrl}/_apis/IdentityPicker/Identities?api-version=5.0-preview.1`, {
    method: "POST",
    headers: { ...authHeaders(config.pat), "Content-Type": "application/json" },
    body: JSON.stringify({
      query: trimmed,
      identityTypes: ["user"],
      operationScopes: ["ims", "source"],
      properties: ["DisplayName", "Mail"],
      options: { MinResults: 5, MaxResults: 15 },
    }),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    results?: { identities?: { localId?: string; displayName?: string; mail?: string; signInAddress?: string }[] }[];
  };
  const identities = data.results?.flatMap((r) => r.identities ?? []) ?? [];
  return identities
    .filter((i) => i.localId && i.displayName)
    .map((i) => ({
      id: i.localId as string,
      displayName: i.displayName as string,
      mail: i.mail || i.signInAddress || "",
    }));
}

// Raw (unsanitized) comment fetch for @-mention detection — sanitizeHtml() strips
// data-vss-mention, so mention detection must read the comment HTML before it's cleaned.
export interface RawComment {
  id: number;
  textRaw: string;
  createdDate: string | null;
  author: string | null; // display name of who wrote the comment
}

export async function fetchRawComments(project: string, externalId: string): Promise<RawComment[]> {
  const c = await apis();
  if (!c) return [];
  try {
    const list = await (await c.wit).getComments(project, Number(externalId));
    return (list.comments ?? []).map((x) => ({
      id: x.id ?? 0,
      textRaw: x.text ?? "",
      createdDate: toIso(x.createdDate),
      author: x.createdBy?.displayName ?? null,
    }));
  } catch {
    return [];
  }
}

// Resolve my identity (GUID + display name) from a work item assigned to me.
// This is reliable — System.AssignedTo.id IS the identity GUID used in
// data-vss-mention anchors — unlike the Identity Picker, which intermittently
// returns zero results.
export interface AdoMe {
  id: string; // identity GUID, matches data-vss-mention
  displayName: string; // for the System.History CONTAINS WORDS query
  uniqueName: string | null; // email/UPN — for assigning newly-created work items to me
}

export async function resolveMe(): Promise<AdoMe | null> {
  const c = await apis();
  if (!c) return null;
  const wit = await c.wit;
  const result = await wit.queryByWiql({
    query: "SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC",
  });
  const id = result.workItems?.[0]?.id;
  if (id == null) return null;
  const wi = await wit.getWorkItem(id, ["System.AssignedTo"]);
  const assignedTo = wi.fields?.["System.AssignedTo"] as { id?: string; displayName?: string; uniqueName?: string } | undefined;
  if (!assignedTo?.id || !assignedTo.displayName) return null;
  return { id: assignedTo.id, displayName: assignedTo.displayName, uniqueName: assignedTo.uniqueName ?? null };
}

export interface MentionCandidate {
  externalId: string;
  title: string;
  url: string;
  project: string;
}

// Work items whose discussion history mentions my display name within the lookback
// window — across ANY assignee (this is what catches mentions on items assigned to
// other people, which the assigned-items sync never sees). Caller confirms the real
// data-vss-mention GUID in each item's comments to filter plain-name false positives.
export async function fetchMentionCandidates(displayName: string, lookbackDays: number, cap = 50): Promise<MentionCandidate[]> {
  const config = await getAzureDevOpsConfig();
  const c = await apis();
  if (!config || !c) return [];
  const wit = await c.wit;
  const safeName = displayName.replace(/'/g, "''");
  const query =
    `SELECT [System.Id] FROM WorkItems WHERE [System.History] CONTAINS WORDS '${safeName}' ` +
    `AND [System.ChangedDate] >= @today - ${lookbackDays} ORDER BY [System.ChangedDate] DESC`;
  const result = await wit.queryByWiql({ query });
  const ids = (result.workItems ?? []).slice(0, cap).map((w) => w.id as number);
  if (ids.length === 0) return [];
  const items = await wit.getWorkItems(ids, ["System.Title", "System.TeamProject"]);
  return items.map((wi) => {
    const f = wi.fields ?? {};
    const project = fieldStr(f, "System.TeamProject");
    return {
      externalId: String(wi.id),
      title: fieldStr(f, "System.Title") || `Work item ${wi.id}`,
      url: itemUrl(config.orgUrl, project, wi.id ?? 0),
      project,
    };
  });
}

// Fetch attachment bytes with the PAT (used by the media proxy route). The id is
// an ADO attachment GUID; the URL is rebuilt from the configured org (no arbitrary
// URLs → no SSRF). KEPT ON FETCH: we need the raw Content-Type header, which the
// SDK's stream-based getAttachmentContent does not surface.
export async function fetchAttachment(id: string, name: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const config = await getAzureDevOpsConfig();
  if (!config) return null;
  const res = await fetch(
    `${config.orgUrl}/_apis/wit/attachments/${encodeURIComponent(id)}?fileName=${encodeURIComponent(name)}&api-version=7.0`,
    { headers: authHeaders(config.pat) },
  );
  if (!res.ok) return null;
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}
