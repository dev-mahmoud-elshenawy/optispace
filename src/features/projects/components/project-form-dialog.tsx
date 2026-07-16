"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_PLATFORMS, PROJECT_STATUSES, type ProjectPlatform, type ProjectStatus } from "@/types";
import { createProject, updateProject } from "../actions";
import type { ProjectInput } from "../schema";
import { PROJECT_PLATFORM_LABELS, PROJECT_STATUS_LABELS, type ProjectView } from "../service";

interface ProjectFormDialogProps {
  mode: "create" | "edit";
  project?: ProjectView;
  trigger: ReactNode;
  // Edit mode: lets the parent card update its own copy instantly (no full-page refresh).
  onSaved?: (values: ProjectInput) => void;
}

export function ProjectFormDialog({ mode, project, trigger, onSaved }: ProjectFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [repoUrl, setRepoUrl] = useState(project?.repoUrl ?? "");
  const [platform, setPlatform] = useState<ProjectPlatform>(project?.platform ?? "web");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "planning");
  const [notes, setNotes] = useState(project?.notes ?? "");

  function resetForm(): void {
    setName(project?.name ?? "");
    setRepoUrl(project?.repoUrl ?? "");
    setPlatform(project?.platform ?? "web");
    setStatus(project?.status ?? "planning");
    setNotes(project?.notes ?? "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    const input = {
      name: name.trim(),
      repoUrl: repoUrl.trim() ? repoUrl.trim() : null,
      platform,
      status,
      notes: notes.trim() ? notes.trim() : null,
    };
    const result =
      mode === "create" ? await createProject(input) : await updateProject(project?.id ?? "", input);
    setIsSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(mode === "create" ? "Project created" : "Project updated");
    setOpen(false);
    if (mode === "create") resetForm();
    // Edit: the parent card updates its own copy instantly (no full-page re-render).
    // Create: no card exists yet, so refresh the list to show the new one.
    if (onSaved) onSaved(input);
    else router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Project" : "Edit Project"}</DialogTitle>
          <DialogDescription>Track a project&apos;s platform, status, and notes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-repo">Repository URL</Label>
            <Input
              id="project-repo"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={(value) => setPlatform(value as ProjectPlatform)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_PLATFORMS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {PROJECT_PLATFORM_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {PROJECT_STATUS_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-notes">Notes</Label>
            <Textarea
              id="project-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {mode === "create" ? "Add Project" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
