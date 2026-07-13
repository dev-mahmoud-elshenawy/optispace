// Client-safe shared types for the Azure DevOps integration (no `server-only`).

import type { TaskPriority } from "@/types";

// An Azure DevOps user identity, used to render @-mention suggestions and to
// build the `data-vss-mention` markup that actually notifies the person in ADO.
export interface AdoIdentity {
  id: string; // identity GUID (localId) → goes into data-vss-mention
  displayName: string;
  mail: string;
}

// ADO work item type → its DevOps swatch color (Agile/Scrum/Basic processes).
// Matched case-insensitively; unknown/custom types use neutral gray.
const WORK_ITEM_TYPE_COLORS: Record<string, string> = {
  bug: "#CC293D",
  task: "#F2CB1D",
  "user story": "#009CCC",
  "product backlog item": "#009CCC",
  feature: "#773B93",
  epic: "#FF7B00",
  issue: "#B4009E",
  impediment: "#CC293D",
  "test case": "#004B50",
};

export function workItemTypeColor(type: string): string {
  return WORK_ITEM_TYPE_COLORS[type.trim().toLowerCase()] ?? "#6B7280";
}

// ADO workflow state → color, grouped the way DevOps colors state categories
// (Proposed = gray, In Progress = blue, Resolved = gold, Completed = green,
// Removed = red). Matched case-insensitively; unknown states use neutral gray.
const WORK_ITEM_STATE_COLORS: Record<string, string> = {
  new: "#b2b2b2",
  proposed: "#b2b2b2",
  "to do": "#b2b2b2",
  approved: "#007acc",
  active: "#007acc",
  committed: "#007acc",
  "in progress": "#007acc",
  doing: "#007acc",
  resolved: "#ff9d00",
  "in review": "#ff9d00",
  testing: "#ff9d00",
  "ready for testing": "#ff9d00",
  done: "#339933",
  closed: "#339933",
  completed: "#339933",
  removed: "#cc293d",
};

export function workItemStateColor(state: string): string {
  return WORK_ITEM_STATE_COLORS[state.trim().toLowerCase()] ?? "#6B7280";
}

// Raw ADO priority (1–4) → its exact ADO label + the local 3-level flag `level` used
// for STYLING, so an ADO "High" flag looks identical to a local "High" flag (same
// color), while the label still shows the precise ADO wording.
const ADO_PRIORITY: Record<number, { label: string; level: TaskPriority }> = {
  1: { label: "Highest", level: "high" },
  2: { label: "High", level: "high" },
  3: { label: "Medium", level: "medium" },
  4: { label: "Low", level: "low" },
};

export function adoPriorityMeta(priority: number): { label: string; level: TaskPriority } {
  return ADO_PRIORITY[priority] ?? { label: `P${priority}`, level: "medium" };
}
