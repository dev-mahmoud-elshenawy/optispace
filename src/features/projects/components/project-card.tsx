"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PROJECT_PLATFORM_LABELS, PROJECT_STATUS_LABELS, type ProjectView } from "../service";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { MilestoneChecklist } from "./milestone-checklist";
import { ProjectFormDialog } from "./project-form-dialog";

interface ProjectCardProps {
  project: ProjectView;
}

const STATUS_BADGE_VARIANT: Record<ProjectView["status"], "default" | "secondary" | "outline"> = {
  planning: "outline",
  active: "default",
  paused: "secondary",
  completed: "secondary",
};

export function ProjectCard({ project }: ProjectCardProps) {
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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{project.progressPct}% complete</span>
            <span>
              {project.milestonesDone}/{project.milestonesTotal} milestones
            </span>
          </div>
          <Progress value={project.progressPct} />
        </div>
        {project.notes ? <p className="text-sm text-muted-foreground">{project.notes}</p> : null}
        <MilestoneChecklist projectId={project.id} milestones={project.milestones} />
      </CardContent>
    </Card>
  );
}
