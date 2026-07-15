import type { Milestone, Project } from "@prisma/client";
import type { ProjectPlatform, ProjectStatus } from "@/types";

export interface MilestoneView {
  id: string;
  title: string;
  done: boolean;
  order: number;
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
  progressPct: number;
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

// Status-matched badge colors (subtle tint, readable in light + dark).
// production = shipped & live, still open for hotfix/support — distinct violet vs completed green.
export const PROJECT_STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  planning: "border-transparent bg-slate-500/15 text-slate-700 dark:text-slate-300",
  active: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-300",
  paused: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  production: "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

export function toMilestoneView(row: Milestone): MilestoneView {
  return { id: row.id, title: row.title, done: row.done, order: row.order };
}

export function toProjectView(row: Project & { milestones: Milestone[] }): ProjectView {
  const milestones = row.milestones.map(toMilestoneView);
  return {
    id: row.id,
    name: row.name,
    repoUrl: row.repoUrl,
    platform: row.platform as ProjectPlatform,
    status: row.status as ProjectStatus,
    progressPct: row.progressPct,
    pinned: row.pinned,
    notes: row.notes,
    milestones,
    milestonesDone: milestones.filter((m) => m.done).length,
    milestonesTotal: milestones.length,
  };
}
