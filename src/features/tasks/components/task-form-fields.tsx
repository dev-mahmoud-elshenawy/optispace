"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABELS } from "@/features/tasks/service";
import type { PullRequestView } from "@/features/integrations/github/types";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/types";

export const NO_PROJECT = "none";
export const NO_PR = "none";

// Select value for a PR = "owner/repo#number" (repo never contains "#", so lastIndexOf splits it).
export function prKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

export interface TaskFormValues {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  projectId: string;
  linkedPr: string; // prKey(repo, number) or NO_PR
}

interface TaskFormFieldsProps {
  values: TaskFormValues;
  onChange: <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) => void;
  projectOptions: { id: string; name: string }[];
  pullRequests: PullRequestView[];
}

export function TaskFormFields({ values, onChange, projectOptions, pullRequests }: TaskFormFieldsProps) {
  // Keep the current selection visible even if its PR left the cache (merged/pruned).
  const prOptions =
    values.linkedPr !== NO_PR && !pullRequests.some((p) => prKey(p.repo, p.number) === values.linkedPr)
      ? [{ key: values.linkedPr, label: values.linkedPr }, ...pullRequests.map((p) => ({ key: prKey(p.repo, p.number), label: `${p.repo} #${p.number} — ${p.title}` }))]
      : pullRequests.map((p) => ({ key: prKey(p.repo, p.number), label: `${p.repo} #${p.number} — ${p.title}` }));

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          value={values.title}
          onChange={(e) => onChange("title", e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="task-description">Description</Label>
        <Textarea
          id="task-description"
          value={values.description}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={values.status} onValueChange={(v) => onChange("status", v as TaskStatus)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={values.priority} onValueChange={(v) => onChange("priority", v as TaskPriority)}>
            <SelectTrigger className="w-full capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p} className="capitalize">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="task-due-date">Due date</Label>
          <Input
            id="task-due-date"
            type="date"
            value={values.dueDate}
            onChange={(e) => onChange("dueDate", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Project</Label>
          <Select value={values.projectId} onValueChange={(v) => onChange("projectId", v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projectOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Linked pull request</Label>
        <Select value={values.linkedPr} onValueChange={(v) => onChange("linkedPr", v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="No pull request" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PR}>No pull request</SelectItem>
            {prOptions.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pullRequests.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sync GitHub in Settings to attach a pull request.</p>
        ) : null}
      </div>
    </>
  );
}
