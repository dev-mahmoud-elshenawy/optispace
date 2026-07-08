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
