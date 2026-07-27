// Team work items are read LIVE from Azure DevOps (no local table, no second sync) — ADO owns
// the team's data and it's only needed while you're looking at it. Keep these types here rather
// than in the ADO service so client components can import them (that file is `server-only`).
import type { TaskStatus } from "@/types";

export interface TeamWorkItem {
  externalId: string;
  title: string;
  type: string;
  state: string;
  status: TaskStatus; // 3-bucket, resolved from the ADO state *category* (custom states work)
  project: string;
  iterationPath: string;
  assignedTo: string; // display name; "" = unassigned
  assignedToEmail: string | null;
  createdDate: string; // ISO
  changedDate: string | null;
  closedDate: string | null;
  url: string;
}

export interface TeamFetchResult {
  items: TeamWorkItem[];
  truncated: boolean; // hit the item cap — surfaced in the UI, never a silent cut
}

export interface TeamMemberStats {
  name: string;
  email: string | null;
  wip: number; // open + in progress right now
  inProgress: number;
  closed: number; // closed inside the window
  bugs: number; // bugs touched inside the window
  bugRatio: number; // 0..1 of that member's items in the window
  medianCycleDays: number | null; // created → closed, median over their closed items
  aging: number; // open items untouched for AGING_DAYS+
  total: number;
}

export interface TeamRollup {
  members: TeamMemberStats[];
  closed: number;
  wip: number;
  bugRatio: number;
  medianCycleDays: number | null;
  unassigned: number;
}

export const TEAM_WINDOWS = [30, 90, 180] as const;
export type TeamWindow = (typeof TEAM_WINDOWS)[number];

export const UNASSIGNED = "Unassigned";
export const AGING_DAYS = 14;
