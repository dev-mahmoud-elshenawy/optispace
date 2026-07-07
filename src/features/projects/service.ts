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
  createdAt: Date;
}

export interface ProjectView {
  id: string;
  name: string;
  repoUrl: string | null;
  platform: ProjectPlatform;
  status: ProjectStatus;
  progressPct: number;
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
    notes: row.notes,
    milestones,
    milestonesDone: milestones.filter((m) => m.done).length,
    milestonesTotal: milestones.length,
  };
}
