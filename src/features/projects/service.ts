import type { Milestone, Project } from "@prisma/client";
import type { ProjectPlatform, ProjectStatus } from "@/types";

export interface MilestoneView {
  id: string;
  title: string;
  done: boolean;
  dueDate: Date | null;
  order: number;
}

// Shared by milestone-based and task-based progress — whichever ratio the caller
// has on hand. 0 when there's nothing to divide by (avoids NaN from a 0/0 divide).
export function computeProgressPct(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export interface ProjectFileMeta {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export const PROJECT_LINK_TYPES = ["release", "dashboard", "server", "repo", "design", "other"] as const;
export type ProjectLinkType = (typeof PROJECT_LINK_TYPES)[number];

export const PROJECT_LINK_TYPE_LABELS: Record<ProjectLinkType, string> = {
  release: "Release",
  dashboard: "Dashboard",
  server: "Server",
  repo: "Repo",
  design: "Design",
  other: "Other",
};

export interface ProjectLinkItem {
  id: string;
  projectId: string;
  label: string;
  url: string;
  type: ProjectLinkType;
  username: string | null;
  secret: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface ProjectFeedbackItem {
  id: string;
  projectId: string;
  message: string;
  from: string | null;
  release: string | null;
  attachments: { id: string; name: string }[];
  createdAt: Date;
}

export interface ProjectView {
  id: string;
  name: string;
  repoUrl: string | null;
  platform: ProjectPlatform;
  status: ProjectStatus;
  pinned: boolean;
  notes: string | null;
  milestones: MilestoneView[];
  milestonesDone: number;
  milestonesTotal: number;
}

export const PROJECT_PLATFORM_LABELS: Record<ProjectPlatform, string> = {
  flutter: "Flutter",
  react_native: "React Native",
  web: "Web",
  backend: "Backend",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  production: "Production",
};

// Priority order for surfacing projects (and their tasks): active work first, done last.
// Single source of truth for the Development page and the Tasks project grouping/sort.
export const PROJECT_STATUS_ORDER: Record<ProjectStatus, number> = {
  active: 0,
  production: 1,
  paused: 2,
  planning: 3,
  completed: 4,
};

// Status-matched badge colors (subtle tint, readable in light + dark).
// production = shipped & live, still open for hotfix/support — distinct violet vs completed green.
export const PROJECT_STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  planning: "border-transparent bg-slate-500/15 text-slate-700 dark:text-slate-300",
  active: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-300",
  paused: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  production: "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

// Project health from milestone deadlines (the data already on ProjectView — no extra query).
// overdue: a milestone past its dueDate and not done. due_soon: due within the next 3 days.
// null = on track / no dated milestones (no badge shown). ponytail: stale-tasks would need task
// data ProjectView doesn't carry — milestone-based is the lazy correct signal; add tasks later.
export type ProjectHealthLevel = "overdue" | "due_soon";

export interface ProjectHealth {
  level: ProjectHealthLevel;
  count: number; // how many milestones drive the signal
}

const DUE_SOON_MS = 3 * 24 * 60 * 60 * 1000;

export function projectHealth(project: Pick<ProjectView, "milestones">, now: Date): ProjectHealth | null {
  let overdue = 0;
  let dueSoon = 0;
  for (const m of project.milestones) {
    if (m.done || !m.dueDate) continue;
    const delta = m.dueDate.getTime() - now.getTime();
    if (delta < 0) overdue += 1;
    else if (delta <= DUE_SOON_MS) dueSoon += 1;
  }
  if (overdue > 0) return { level: "overdue", count: overdue };
  if (dueSoon > 0) return { level: "due_soon", count: dueSoon };
  return null;
}

export const PROJECT_HEALTH_BADGE: Record<ProjectHealthLevel, { label: (n: number) => string; className: string }> = {
  overdue: {
    label: (n) => `${n} overdue`,
    className: "border-transparent bg-destructive/15 text-destructive",
  },
  due_soon: {
    label: (n) => `${n} due soon`,
    className: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
};

export function toMilestoneView(row: Milestone): MilestoneView {
  return { id: row.id, title: row.title, done: row.done, dueDate: row.dueDate, order: row.order };
}

export function toProjectView(row: Project & { milestones: Milestone[] }): ProjectView {
  const milestones = row.milestones.map(toMilestoneView);
  return {
    id: row.id,
    name: row.name,
    repoUrl: row.repoUrl,
    platform: row.platform as ProjectPlatform,
    status: row.status as ProjectStatus,
    pinned: row.pinned,
    notes: row.notes,
    milestones,
    milestonesDone: milestones.filter((m) => m.done).length,
    milestonesTotal: milestones.length,
  };
}
