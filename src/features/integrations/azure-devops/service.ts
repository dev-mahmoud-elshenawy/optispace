import "server-only";

import DOMPurify from "isomorphic-dompurify";

import type { TaskStatus } from "@/types";

// ── Config (per-user, from .env) ─────────────────────────────────────────────
export interface AzureDevOpsConfig {
  orgUrl: string;
  pat: string;
  email: string | null;
  projects: string[]; // empty = all accessible projects
  includeDone: boolean;
}

export function getAzureDevOpsConfig(): AzureDevOpsConfig | null {
  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL?.trim();
  const pat = process.env.AZURE_DEVOPS_PAT?.trim();
  if (!orgUrl || !pat) return null;
  return {
    orgUrl: orgUrl.replace(/\/+$/, ""),
    pat,
    email: process.env.AZURE_DEVOPS_EMAIL?.trim() || null,
    projects: (process.env.AZURE_DEVOPS_PROJECTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    includeDone: (process.env.AZURE_DEVOPS_INCLUDE_DONE ?? "").toLowerCase() === "true",
  };
}

export function isAzureDevOpsEnabled(): boolean {
  return getAzureDevOpsConfig() !== null;
}

// ── Fetch (read-only) ────────────────────────────────────────────────────────
export interface WorkItemDTO {
  externalId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  url: string;
  project: string;
  iterationPath: string | null;
}

const API = "api-version=7.0";
const MAX_ITEMS = 200; // cap per sync so a huge backlog can't flood the board

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

function authHeaders(pat: string): HeadersInit {
  return {
    Authorization: "Basic " + Buffer.from(":" + pat).toString("base64"),
    "Content-Type": "application/json",
  };
}

export interface AssignedWorkItems {
  items: WorkItemDTO[]; // open items to import (capped)
  openIds: string[]; // every not-Removed assigned id (uncapped) — for pruning
  doneIds: string[]; // ids in the fetched batch that are done — for pruning
}

export async function fetchAssignedWorkItems(config: AzureDevOpsConfig): Promise<AssignedWorkItems> {
  const { orgUrl, pat, projects, includeDone } = config;
  const headers = authHeaders(pat);

  const projectFilter =
    projects.length > 0
      ? ` AND [System.TeamProject] IN (${projects.map((p) => `'${p.replace(/'/g, "''")}'`).join(", ")})`
      : "";
  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.State] <> 'Removed'${projectFilter} ORDER BY [System.ChangedDate] DESC`;

  const wiqlRes = await fetch(`${orgUrl}/_apis/wit/wiql?${API}`, { method: "POST", headers, body: JSON.stringify({ query }) });
  if (!wiqlRes.ok) {
    throw new Error(`Azure DevOps WIQL failed (${wiqlRes.status}). Check the PAT scopes and org URL.`);
  }
  const wiql = (await wiqlRes.json()) as { workItems?: { id: number }[] };
  const openIds = (wiql.workItems ?? []).map((w) => String(w.id));
  const ids = openIds.slice(0, MAX_ITEMS).map((id) => Number(id));
  if (ids.length === 0) return { items: [], openIds, doneIds: [] };

  const fields = ["System.Title", "System.Description", "System.State", "System.WorkItemType", "System.TeamProject", "System.IterationPath"];
  const detailRes = await fetch(`${orgUrl}/_apis/wit/workitems?ids=${ids.join(",")}&fields=${fields.join(",")}&${API}`, { headers });
  if (!detailRes.ok) {
    throw new Error(`Azure DevOps work item fetch failed (${detailRes.status}).`);
  }
  const detail = (await detailRes.json()) as { value: { id: number; fields: Record<string, string> }[] };

  // Resolve state → category per (project, type), cached.
  const stateMaps = new Map<string, Record<string, string>>();
  async function statesFor(project: string, type: string): Promise<Record<string, string>> {
    const key = `${project}|${type}`;
    const cached = stateMaps.get(key);
    if (cached) return cached;
    let map: Record<string, string> = {};
    try {
      const res = await fetch(
        `${orgUrl}/${encodeURIComponent(project)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?${API}`,
        { headers },
      );
      if (res.ok) {
        const body = (await res.json()) as { value: { name: string; category: string }[] };
        map = Object.fromEntries(body.value.map((s) => [s.name, s.category]));
      }
    } catch {
      map = {};
    }
    stateMaps.set(key, map);
    return map;
  }

  const items: WorkItemDTO[] = [];
  const doneIds: string[] = [];
  for (const wi of detail.value) {
    const f = wi.fields;
    const project = f["System.TeamProject"];
    const type = f["System.WorkItemType"];
    const state = f["System.State"];
    const category = (await statesFor(project, type))[state];
    const status = category ? categoryToStatus(category) : nameHeuristic(state);
    if (status === null) continue; // Removed/unknown category
    if (status === "done") {
      doneIds.push(String(wi.id));
      if (!includeDone) continue;
    }
    items.push({
      externalId: String(wi.id),
      title: f["System.Title"] ?? `Work item ${wi.id}`,
      description: f["System.Description"] ?? null,
      status,
      url: `${orgUrl}/${encodeURIComponent(project)}/_workitems/edit/${wi.id}`,
      project,
      iterationPath: f["System.IterationPath"] || null,
    });
  }
  return { items, openIds, doneIds };
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
  details: { label: string; value: string }[]; // remaining read-only extras (area, story points, tags)
  url: string;
  comments: WorkItemComment[];
  attachments: WorkItemAttachment[];
}

// Notable work-item fields to surface in the popup (only shown when populated).
// Read-only extras shown below the editable form (the editable fields — assignee,
// iteration, priority, effort, estimates — are handled as inputs, not here).
const DETAIL_FIELDS: { key: string; label: string; format: (v: unknown) => string }[] = [
  { key: "System.AreaPath", label: "Area", format: String },
  { key: "Microsoft.VSTS.Scheduling.StoryPoints", label: "Story points", format: String },
  { key: "System.Tags", label: "Tags", format: String },
];

// Sanitize ADO-authored HTML with DOMPurify + a strict tag/attr allowlist.
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "i", "strong", "em", "u", "s", "ul", "ol", "li", "a", "code", "pre", "blockquote", "h1", "h2", "h3", "h4", "span", "div", "table", "thead", "tbody", "tr", "th", "td"],
    ALLOWED_ATTR: ["href", "title"],
    ALLOWED_URI_REGEXP: /^https?:/i,
  });
}

export async function fetchWorkItemDetail(externalId: string): Promise<WorkItemDetail | null> {
  const config = getAzureDevOpsConfig();
  if (!config) return null;
  const { orgUrl, pat } = config;
  const headers = authHeaders(pat);

  const wiRes = await fetch(`${orgUrl}/_apis/wit/workitems/${encodeURIComponent(externalId)}?$expand=all&${API}`, { headers });
  if (!wiRes.ok) throw new Error(`Failed to load work item ${externalId} (${wiRes.status}).`);
  const wi = (await wiRes.json()) as {
    rev: number;
    fields: Record<string, unknown>;
    relations?: { rel: string; url: string; attributes?: { name?: string } }[];
  };
  const str = (k: string): string => {
    const v = wi.fields[k];
    return v == null ? "" : String(v);
  };
  const project = str("System.TeamProject");
  const type = str("System.WorkItemType");
  const description = (wi.fields["System.Description"] as string | undefined) ?? null;
  const allowedStates = (await fetchStates(project, type)).map((s) => s.name);

  const details = DETAIL_FIELDS.flatMap(({ key, label, format }) => {
    const v = wi.fields[key];
    if (v === undefined || v === null || v === "") return [];
    return [{ label, value: format(v) }];
  });

  const attachments: WorkItemAttachment[] = (wi.relations ?? [])
    .filter((r) => r.rel === "AttachedFile")
    .map((r) => {
      const id = r.url.split("/").pop() ?? "";
      const name = r.attributes?.name ?? id;
      return { id, name, isImage: /\.(png|jpe?g|gif|webp|bmp)$/i.test(name) };
    });

  let comments: WorkItemComment[] = [];
  try {
    const cRes = await fetch(
      `${orgUrl}/${encodeURIComponent(project)}/_apis/wit/workItems/${encodeURIComponent(externalId)}/comments?api-version=7.1-preview.4`,
      { headers },
    );
    if (cRes.ok) {
      const c = (await cRes.json()) as {
        comments?: { text?: string; createdBy?: { displayName?: string }; createdDate?: string }[];
      };
      comments = (c.comments ?? []).map((x) => ({
        author: x.createdBy?.displayName ?? "Unknown",
        text: sanitizeHtml(x.text ?? ""),
        date: x.createdDate ?? "",
      }));
    }
  } catch {
    comments = [];
  }

  const iterations = await fetchIterations(project);
  const assignedTo = (wi.fields["System.AssignedTo"] as { uniqueName?: string } | undefined)?.uniqueName ?? "";

  return {
    externalId: String(externalId),
    title: str("System.Title"),
    rev: wi.rev,
    project,
    descriptionHtml: description ? sanitizeHtml(description) : null,
    descriptionRaw: description ?? "",
    state: str("System.State"),
    type,
    allowedStates,
    priority: str("Microsoft.VSTS.Common.Priority"),
    effort: str("Microsoft.VSTS.Scheduling.Effort"),
    originalEstimate: str("Microsoft.VSTS.Scheduling.OriginalEstimate"),
    remainingWork: str("Microsoft.VSTS.Scheduling.RemainingWork"),
    completedWork: str("Microsoft.VSTS.Scheduling.CompletedWork"),
    iterationPath: str("System.IterationPath"),
    assignedTo,
    iterations,
    details,
    url: `${orgUrl}/${encodeURIComponent(project)}/_workitems/edit/${externalId}`,
    comments,
    attachments,
  };
}

// ── Write-back ───────────────────────────────────────────────────────────────
export interface StateOption {
  name: string;
  category: string;
}

export async function fetchStates(project: string, type: string): Promise<StateOption[]> {
  const config = getAzureDevOpsConfig();
  if (!config) return [];
  const res = await fetch(
    `${config.orgUrl}/${encodeURIComponent(project)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?${API}`,
    { headers: authHeaders(config.pat) },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { value: { name: string; category: string }[] };
  return body.value.map((s) => ({ name: s.name, category: s.category }));
}

// Maps an ADO state name back to our TaskStatus (for reflecting a write locally).
export async function statusForState(project: string, type: string, state: string): Promise<TaskStatus | null> {
  const match = (await fetchStates(project, type)).find((s) => s.name === state);
  return match ? categoryToStatus(match.category) : null;
}

// PATCH arbitrary fields (ADO field key → value) with optimistic concurrency
// (rev test → 412 if changed upstream). Empty-string values clear the field.
export async function updateWorkItem(
  externalId: string,
  rev: number,
  fields: Record<string, unknown>,
): Promise<void> {
  const config = getAzureDevOpsConfig();
  if (!config) throw new Error("Azure DevOps is not configured.");
  const ops: { op: string; path: string; value: unknown }[] = [
    { op: "test", path: "/rev", value: rev },
    ...Object.entries(fields).map(([key, value]) => ({ op: "add", path: `/fields/${key}`, value })),
  ];

  const res = await fetch(`${config.orgUrl}/_apis/wit/workitems/${encodeURIComponent(externalId)}?${API}`, {
    method: "PATCH",
    headers: { ...authHeaders(config.pat), "Content-Type": "application/json-patch+json" },
    body: JSON.stringify(ops),
  });
  if (res.status === 412) throw new Error("This work item changed in Azure DevOps — reopen it and try again.");
  if (!res.ok) throw new Error(`Azure DevOps update failed (${res.status}).`);
}

// Iteration paths available in a project (for the sprint dropdown).
export async function fetchIterations(project: string): Promise<string[]> {
  const config = getAzureDevOpsConfig();
  if (!config) return [];
  const res = await fetch(
    `${config.orgUrl}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/iterations?$depth=5&${API}`,
    { headers: authHeaders(config.pat) },
  );
  if (!res.ok) return [];
  const root = (await res.json()) as IterationNode;
  const paths: string[] = [];
  const walk = (node: IterationNode, prefix: string) => {
    const path = prefix ? `${prefix}\\${node.name}` : node.name;
    if (!node.hasChildren || (node.children?.length ?? 0) === 0) paths.push(path);
    node.children?.forEach((c) => walk(c, path));
  };
  walk(root, "");
  return paths;
}

interface IterationNode {
  name: string;
  hasChildren?: boolean;
  children?: IterationNode[];
}

export async function postComment(project: string, externalId: string, text: string): Promise<void> {
  const config = getAzureDevOpsConfig();
  if (!config) throw new Error("Azure DevOps is not configured.");
  const res = await fetch(
    `${config.orgUrl}/${encodeURIComponent(project)}/_apis/wit/workItems/${encodeURIComponent(externalId)}/comments?api-version=7.1-preview.4`,
    {
      method: "POST",
      headers: { ...authHeaders(config.pat), "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
  );
  if (!res.ok) throw new Error(`Adding the comment failed (${res.status}).`);
}

// Fetch attachment bytes with the PAT (used by the media proxy route). The id is
// an ADO attachment GUID; the URL is rebuilt from the configured org (no arbitrary
// URLs → no SSRF).
export async function fetchAttachment(id: string, name: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const config = getAzureDevOpsConfig();
  if (!config) return null;
  const res = await fetch(
    `${config.orgUrl}/_apis/wit/attachments/${encodeURIComponent(id)}?fileName=${encodeURIComponent(name)}&${API}`,
    { headers: authHeaders(config.pat) },
  );
  if (!res.ok) return null;
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}
