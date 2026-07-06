import type { Milestone, Project } from "@prisma/client";
import type { ProjectPlatform, ProjectStatus } from "@/types";

export interface MilestoneView {
  id: string;
  title: string;
  done: boolean;
  order: number;
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
