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
  // Estimation fields, in hours (storyPoints is ADO's "Effort"). Frequently null — this org fills
  // in OriginalEstimate but never CompletedWork, so accuracy can't be computed from them alone.
  originalEstimate: number | null;
  remainingWork: number | null;
  completedWork: number | null;
  storyPoints: number | null;
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
  // Estimation discipline: how many of their items carry an estimate at all, and the planned vs
  // logged hours. `accuracy` (median logged/planned) stays null unless CompletedWork is filled in.
  estimated: number;
  estimateCoverage: number; // 0..1
  plannedHours: number;
  loggedHours: number;
  accuracy: number | null;
}

export interface TeamRollup {
  members: TeamMemberStats[];
  closed: number;
  wip: number;
  bugRatio: number;
  medianCycleDays: number | null;
  unassigned: number;
  estimateCoverage: number; // 0..1 across every item in view
  plannedHours: number;
  loggedHours: number; // 0 whenever nobody logs Completed Work
}

export interface TeamIteration {
  path: string;
  startDate: string | null;
  finishDate: string | null;
}

// Per-member drill-down: distributions, not single opaque numbers. A median hides a bulk close;
// a histogram shows it.
export interface MemberDetail {
  closedByMonth: { label: string; count: number }[];
  closedBySprint: { label: string; count: number }[];
  cycleBuckets: { label: string; count: number }[];
  typeMix: { label: string; count: number }[];
  openByState: { label: string; count: number }[];
  // Bugs vs user stories: how many, how long each takes to close, and the planned hours behind
  // them — answers "how much of this person's time do bugs eat compared to feature work".
  byType: { label: string; count: number; closed: number; medianDays: number | null; plannedHours: number }[];
  fastestDays: number | null;
  slowestDays: number | null;
  oldestOpenDays: number | null;
}

export const TEAM_WINDOWS = [15, 30, 90, 180] as const;
export const DEFAULT_TEAM_WINDOW = 30;
export type TeamWindow = (typeof TEAM_WINDOWS)[number];

export const UNASSIGNED = "Unassigned";
export const AGING_DAYS = 14;

// Container types: a User Story / Feature / Epic is typically assigned to whoever owns the story,
// while the real work sits on its child Tasks and Bugs. Counting both would credit the same work
// twice and flatter whoever holds the stories — so the default scope excludes containers.
export const CONTAINER_TYPES = ["user story", "feature", "epic", "requirement"];

export function isContainerType(type: string): boolean {
  return CONTAINER_TYPES.includes(type.trim().toLowerCase());
}
