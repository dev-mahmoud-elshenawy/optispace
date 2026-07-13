"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createTask, updateTask } from "@/features/tasks/actions";
import {
  createAzureDevOpsTask,
  getAzureDevOpsIterations,
  getAzureDevOpsProjects,
  getAzureDevOpsWorkItemTypes,
  searchAzureDevOpsIdentities,
} from "@/features/integrations/azure-devops/actions";
import type { AdoIdentity } from "@/features/integrations/azure-devops/types";
import type { TaskView } from "@/features/tasks/service";

import { NO_PROJECT, TaskFormFields, type TaskFormValues } from "./task-form-fields";
import { SubtaskChecklist } from "./subtask-checklist";

interface TaskFormDialogProps {
  task: TaskView | null;
  projectOptions: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function toDateInputValue(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function initialValues(task: TaskView | null): TaskFormValues {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "todo",
    priority: task?.priority ?? "medium",
    dueDate: toDateInputValue(task?.dueDate),
    projectId: task?.projectId ?? NO_PROJECT,
  };
}

type Mode = "normal" | "devops";

export function TaskFormDialog({ task, projectOptions, onOpenChange, onSaved }: TaskFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<TaskFormValues>(() => initialValues(task));

  // DevOps create mode (only offered when creating, not editing).
  const [mode, setMode] = useState<Mode>("normal");
  const [projects, setProjects] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [iterations, setIterations] = useState<string[]>([]);
  const [ado, setAdo] = useState({
    project: "",
    type: "",
    title: "",
    description: "",
    priority: "",
    iterationPath: "",
    assignee: "", // email/UPN; "" = assign to me
  });
  const [assigneeLabel, setAssigneeLabel] = useState(""); // what the user typed / picked
  const [assigneeResults, setAssigneeResults] = useState<AdoIdentity[]>([]);
  const [searchingAssignee, setSearchingAssignee] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);

  function handleChange<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // Load all accessible projects the first time DevOps mode is opened.
  useEffect(() => {
    if (mode !== "devops" || projects.length > 0) return;
    setLoadingProjects(true);
    getAzureDevOpsProjects()
      .then((p) => setProjects(p))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [mode, projects.length]);

  // Load the work item types + iterations whenever the chosen project changes.
  useEffect(() => {
    if (!ado.project) {
      setTypes([]);
      setIterations([]);
      return;
    }
    setLoadingTypes(true);
    getAzureDevOpsWorkItemTypes(ado.project)
      .then((t) => {
        setTypes(t);
        setAdo((a) => ({ ...a, type: t.includes(a.type) ? a.type : (t[0] ?? "") }));
      })
      .catch(() => setTypes([]))
      .finally(() => setLoadingTypes(false));
    getAzureDevOpsIterations(ado.project)
      .then(setIterations)
      .catch(() => setIterations([]));
  }, [ado.project]);

  // Debounced assignee identity search (empty = assign to me). The ADO Identity Picker
  // is slow/flaky, so: longer debounce, a "Searching…" flag, and a stale-response guard
  // (cancelled) so a late reply from an earlier keystroke can't overwrite newer results.
  useEffect(() => {
    const q = assigneeLabel.trim();
    if (q.length < 2) {
      setAssigneeResults([]);
      setSearchingAssignee(false);
      return;
    }
    let cancelled = false;
    setSearchingAssignee(true);
    const t = setTimeout(() => {
      searchAzureDevOpsIdentities(q)
        .then((r) => {
          if (!cancelled) setAssigneeResults(r);
        })
        .catch(() => {
          if (!cancelled) setAssigneeResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingAssignee(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [assigneeLabel]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (mode === "devops") {
      startTransition(async () => {
        const result = await createAzureDevOpsTask({
          project: ado.project,
          type: ado.type,
          title: ado.title,
          description: ado.description,
          priority: ado.priority,
          iterationPath: ado.iterationPath,
          assignee: ado.assignee,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Work item created in Azure DevOps");
        onSaved();
        onOpenChange(false);
      });
      return;
    }

    const input = {
      title: values.title,
      description: values.description,
      status: values.status,
      priority: values.priority,
      dueDate: values.dueDate,
      projectId: values.projectId === NO_PROJECT ? undefined : values.projectId,
    };

    startTransition(async () => {
      const result = task ? await updateTask(task.id, input) : await createTask(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(task ? "Task updated" : "Task created");
      onSaved();
      onOpenChange(false);
    });
  }

  const submitDisabled =
    isPending ||
    (mode === "normal"
      ? values.title.trim().length === 0
      : !ado.project || !ado.type || ado.title.trim().length === 0);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{task ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>

          {!task ? (
            <div className="inline-flex w-fit rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
              {(["normal", "devops"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1 font-medium transition-colors",
                    mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "normal" ? "Normal" : "Azure DevOps"}
                </button>
              ))}
            </div>
          ) : null}

          {mode === "devops" && !task ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={ado.project} onValueChange={(v) => setAdo((a) => ({ ...a, project: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loadingProjects ? "Loading projects…" : "Select a project"} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!loadingProjects && projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No accessible projects — check the PAT / org URL.</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Work item type</Label>
                <Select value={ado.type} onValueChange={(v) => setAdo((a) => ({ ...a, type: v }))} disabled={!ado.project}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loadingTypes ? "Loading types…" : "Select a type"} />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ado-title">Title</Label>
                <Input
                  id="ado-title"
                  value={ado.title}
                  onChange={(e) => setAdo((a) => ({ ...a, title: e.target.value }))}
                  placeholder="Work item title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ado-desc">Description</Label>
                <textarea
                  id="ado-desc"
                  value={ado.description}
                  onChange={(e) => setAdo((a) => ({ ...a, description: e.target.value }))}
                  placeholder="Optional"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={ado.priority || "none"}
                  onValueChange={(v) => setAdo((a) => ({ ...a, priority: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default</SelectItem>
                    <SelectItem value="1">1 · Highest</SelectItem>
                    <SelectItem value="2">2 · High</SelectItem>
                    <SelectItem value="3">3 · Medium</SelectItem>
                    <SelectItem value="4">4 · Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Iteration / sprint</Label>
                <Select
                  value={ado.iterationPath || "none"}
                  onValueChange={(v) => setAdo((a) => ({ ...a, iterationPath: v === "none" ? "" : v }))}
                  disabled={!ado.project}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No sprint" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No sprint</SelectItem>
                    {iterations.map((it) => (
                      <SelectItem key={it} value={it}>
                        {it}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ado-assignee">Assignee</Label>
                <div className="relative">
                  <Input
                    id="ado-assignee"
                    value={assigneeLabel}
                    onChange={(e) => {
                      setAssigneeLabel(e.target.value);
                      setAdo((a) => ({ ...a, assignee: "" })); // reset until a result is picked
                    }}
                    placeholder="Assigned to me — type a name to change"
                  />
                  {!ado.assignee && assigneeLabel.trim().length >= 2 ? (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                      {searchingAssignee ? (
                        <p className="px-3 py-1.5 text-xs text-muted-foreground">Searching…</p>
                      ) : assigneeResults.length === 0 ? (
                        <p className="px-3 py-1.5 text-xs text-muted-foreground">No matches.</p>
                      ) : (
                        assigneeResults.map((id) => (
                          <button
                            key={id.id}
                            type="button"
                            onClick={() => {
                              setAdo((a) => ({ ...a, assignee: id.mail }));
                              setAssigneeLabel(id.displayName);
                              setAssigneeResults([]);
                            }}
                            className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-accent/60"
                          >
                            <span>{id.displayName}</span>
                            {id.mail ? <span className="text-xs text-muted-foreground">{id.mail}</span> : null}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Creates the work item in Azure DevOps and adds it to your board.
              </p>
            </div>
          ) : (
            <>
              <TaskFormFields values={values} onChange={handleChange} projectOptions={projectOptions} />

              {task ? (
                <div className="border-t pt-4">
                  <SubtaskChecklist taskId={task.id} subtasks={task.subtasks} />
                </div>
              ) : null}
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {task ? "Save changes" : mode === "devops" ? "Create in DevOps" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
