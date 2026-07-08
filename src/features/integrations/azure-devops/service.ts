import "server-only";

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

export async function fetchAssignedWorkItems(config: AzureDevOpsConfig): Promise<WorkItemDTO[]> {
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
  const ids = (wiql.workItems ?? []).slice(0, MAX_ITEMS).map((w) => w.id);
  if (ids.length === 0) return [];

  const fields = ["System.Title", "System.Description", "System.State", "System.WorkItemType", "System.TeamProject"];
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
  for (const wi of detail.value) {
    const f = wi.fields;
    const project = f["System.TeamProject"];
    const type = f["System.WorkItemType"];
    const state = f["System.State"];
    const category = (await statesFor(project, type))[state];
    const status = category ? categoryToStatus(category) : nameHeuristic(state);
    if (status === null) continue; // Removed/unknown category
    if (!includeDone && status === "done") continue;
    items.push({
      externalId: String(wi.id),
      title: f["System.Title"] ?? `Work item ${wi.id}`,
      description: f["System.Description"] ?? null,
      status,
      url: `${orgUrl}/${encodeURIComponent(project)}/_workitems/edit/${wi.id}`,
      project,
    });
  }
  return items;
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
  descriptionHtml: string | null;
  state: string;
  type: string;
  url: string;
  comments: WorkItemComment[];
  attachments: WorkItemAttachment[];
}

// Lightweight sanitizer for ADO-authored HTML (internal content). Strips script/
// style blocks, inline event handlers, and javascript: URLs.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

export async function fetchWorkItemDetail(externalId: string): Promise<WorkItemDetail | null> {
  const config = getAzureDevOpsConfig();
  if (!config) return null;
  const { orgUrl, pat } = config;
  const headers = authHeaders(pat);

  const wiRes = await fetch(`${orgUrl}/_apis/wit/workitems/${encodeURIComponent(externalId)}?$expand=relations&${API}`, { headers });
  if (!wiRes.ok) throw new Error(`Failed to load work item ${externalId} (${wiRes.status}).`);
  const wi = (await wiRes.json()) as {
    fields: Record<string, string>;
    relations?: { rel: string; url: string; attributes?: { name?: string } }[];
  };
  const project = wi.fields["System.TeamProject"];
  const description = wi.fields["System.Description"] ?? null;

  const attachments: WorkItemAttachment[] = (wi.relations ?? [])
    .filter((r) => r.rel === "AttachedFile")
    .map((r) => {
      const id = r.url.split("/").pop() ?? "";
      const name = r.attributes?.name ?? id;
      return { id, name, isImage: /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name) };
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

  return {
    descriptionHtml: description ? sanitizeHtml(description) : null,
    state: wi.fields["System.State"] ?? "",
    type: wi.fields["System.WorkItemType"] ?? "",
    url: `${orgUrl}/${encodeURIComponent(project)}/_workitems/edit/${externalId}`,
    comments,
    attachments,
  };
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
