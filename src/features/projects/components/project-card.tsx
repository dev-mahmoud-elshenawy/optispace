"use client";

import { ChevronRight, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { taskDaySpan, type TaskView } from "@/features/tasks/service";
import { TaskMiniRow } from "@/features/tasks/components/task-project-groups";
import {
  PROJECT_PLATFORM_LABELS,
  PROJECT_STATUS_LABELS,
  type ProjectFeedbackItem,
  type ProjectFileMeta,
  type ProjectLinkItem,
  type ProjectView,
} from "../service";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { MilestoneChecklist } from "./milestone-checklist";
import { ProjectFiles } from "./project-files";
import { ProjectFeedback, ProjectLinks } from "./project-resources";
import { ProjectFormDialog } from "./project-form-dialog";

interface ProjectCardProps {
  project: ProjectView;
  tasks: TaskView[];
  files: ProjectFileMeta[];
  links: ProjectLinkItem[];
  feedback: ProjectFeedbackItem[];
}

const STATUS_BADGE_VARIANT: Record<ProjectView["status"], "default" | "secondary" | "outline"> = {
  planning: "outline",
  active: "default",
  paused: "secondary",
  completed: "secondary",
};

export function ProjectCard({ project, tasks, files, links, feedback }: ProjectCardProps) {
  const span = taskDaySpan(tasks);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-medium">{project.name}</h3>
            <Badge variant="outline">{PROJECT_PLATFORM_LABELS[project.platform]}</Badge>
            <Badge variant={STATUS_BADGE_VARIANT[project.status]}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </div>
          {project.repoUrl ? (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              {project.repoUrl}
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <ProjectFormDialog
            mode="edit"
            project={project}
            trigger={
              <Button variant="ghost" size="icon-sm">
                <Pencil />
              </Button>
            }
          />
          <DeleteProjectDialog
            projectId={project.id}
            projectName={project.name}
            trigger={
              <Button variant="ghost" size="icon-sm">
                <Trash2 />
              </Button>
            }
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {project.milestonesDone}/{project.milestonesTotal} milestones done
        </div>
        {project.notes ? <p className="text-sm text-muted-foreground">{project.notes}</p> : null}
        <MilestoneChecklist projectId={project.id} milestones={project.milestones} />
        {tasks.length > 0 ? (
          <div className="space-y-0.5 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between px-2 text-xs font-medium text-muted-foreground">
              <span>Tasks</span>
              <span className="tabular-nums">
                {tasks.length} task{tasks.length === 1 ? "" : "s"}
                {span != null ? ` · ${span} day${span === 1 ? "" : "s"}` : ""}
              </span>
            </div>
            {tasks.map((task) => (
              <TaskMiniRow key={task.id} task={task} />
            ))}
          </div>
        ) : null}
        <details className="group border-t border-border/60 pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Files{files.length ? ` (${files.length})` : ""}
          </summary>
          <div className="mt-2">
            <ProjectFiles projectId={project.id} files={files} />
          </div>
        </details>
        <details className="group border-t border-border/60 pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Links{links.length ? ` (${links.length})` : ""}
          </summary>
          <div className="mt-2">
            <ProjectLinks projectId={project.id} links={links} />
          </div>
        </details>
        <details className="group border-t border-border/60 pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            Feedback{feedback.length ? ` (${feedback.length})` : ""}
          </summary>
          <div className="mt-2">
            <ProjectFeedback projectId={project.id} feedback={feedback} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
