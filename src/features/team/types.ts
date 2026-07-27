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
  // When the item actually went Active. THE key field for "how long did this take": an item can sit
  // in the backlog for months, so created → closed measures the queue, not the work.
  activatedDate: string | null;
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
  medianWorkDays: number | null; // Active → Closed: CALENDAR time in progress (not hours worked)
  medianWaitDays: number | null; // Created → Active: how long it sat before anyone started
  medianLeadDays: number | null; // Created → Closed: includes however long it waited in the backlog
  aging: number; // open items untouched for AGING_DAYS+
  total: number;
  // Estimation discipline: how many of their items carry an estimate at all, and the planned vs
  // logged hours. `accuracy` (median logged/planned) stays null unless CompletedWork is filled in.
  estimated: number;
  estimateCoverage: number; // 0..1
  plannedHours: number; // Original Estimate
  remainingHours: number; // Remaining Work — the closest thing to "actual" this org records
  loggedHours: number; // Completed Work — 0 when nobody logs it
  storyPoints: number; // ADO "Effort" — the field this team actually fills in
  effortItems: number; // how many of their items carry an Effort value
  accuracy: number | null;
}

export interface TeamRollup {
  members: TeamMemberStats[];
  closed: number;
  wip: number;
  bugRatio: number;
  medianWorkDays: number | null;
  medianWaitDays: number | null;
  medianLeadDays: number | null;
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

// A judgement about one person, phrased for a review conversation. `tone` drives the colour:
// strength / watch / risk — never a raw number without its meaning.
export interface Insight {
  tone: "good" | "watch" | "risk";
  text: string;
}

// Team-wide reference points so a member's numbers can be read as relative, which is the only
// fair way to evaluate: "41% bugs vs 12% team average" says something, "41%" alone doesn't.
export interface TeamAverages {
  bugRatio: number;
  medianWorkDays: number | null;
  estimateCoverage: number;
  closedPerMember: number;
}

// Per-member drill-down: distributions, not single opaque numbers. A median hides a bulk close;
// a histogram shows it.
export interface MemberDetail {
  weekly: { label: string; count: number }[]; // finished per week, oldest → newest
  p85WorkDays: number | null; // the "worst realistic case" — consistency, not just the median
  activatedCoverage: number; // share of closed items that even have an Active date (else we fall back to lead time)
  fastCloseRate: number; // 0..1 share of closed items done in under FAST_CLOSE_DAYS
  closedByMonth: { label: string; count: number }[];
  closedBySprint: { label: string; count: number }[];
  cycleBuckets: { label: string; count: number }[];
  typeMix: { label: string; count: number }[];
  openByState: { label: string; count: number }[];
  openAgeBuckets: { label: string; count: number }[]; // open items by time since their last update
  // Bugs vs user stories: how many, how long each takes to close, and the planned hours behind
  // them — answers "how much of this person's time do bugs eat compared to feature work".
  byType: { label: string; count: number; closed: number; medianDays: number | null; plannedHours: number }[];
  fastestDays: number | null;
  slowestDays: number | null;
  oldestOpenDays: number | null;
  // Responsiveness / board hygiene. Comment-reply latency would need a per-item history call, so
  // the honest proxies are: how fresh their open items are, and how many were never touched at all.
  medianUpdateAgeDays: number | null; // median days since the last update on their OPEN items
  openInProgressDays: number | null; // how long their OPEN items have been Active — the live version
  lateStageOpen: number; // open items parked in a testing/review state: waiting on someone else
  neverUpdated: number; // open, older than AGING_DAYS, and never edited since creation
  bugFixDays: number | null; // median close time for Bugs
  featureFixDays: number | null; // median close time for everything else
}

export const TEAM_WINDOWS = [15, 30, 90, 180] as const;
export const DEFAULT_TEAM_WINDOW = 30;
export type TeamWindow = (typeof TEAM_WINDOWS)[number];

export const UNASSIGNED = "Unassigned";
export const AGING_DAYS = 14;
export const FAST_CLOSE_DAYS = 3; // "turned around quickly" threshold used by the insights
export const MAX_WEEKS_SHOWN = 12; // the weekly chart follows the selected window, capped here

// Container types: a User Story / Feature / Epic is typically assigned to whoever owns the story,
// while the real work sits on its child Tasks and Bugs. Counting both would credit the same work
// twice and flatter whoever holds the stories — so the default scope excludes containers.
export const CONTAINER_TYPES = ["user story", "feature", "epic", "requirement"];

export function isContainerType(type: string): boolean {
  return CONTAINER_TYPES.includes(type.trim().toLowerCase());
}
