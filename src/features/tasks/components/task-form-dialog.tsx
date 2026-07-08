"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createTask, updateTask } from "@/features/tasks/actions";
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
    tagsInput: task?.tags.join(", ") ?? "",
    projectId: task?.projectId ?? NO_PROJECT,
  };
}

export function TaskFormDialog({ task, projectOptions, onOpenChange, onSaved }: TaskFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<TaskFormValues>(() => initialValues(task));

  function handleChange<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const input = {
      title: values.title,
      description: values.description,
      status: values.status,
      priority: values.priority,
      dueDate: values.dueDate,
      tags: values.tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
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

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{task ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>

          <TaskFormFields values={values} onChange={handleChange} projectOptions={projectOptions} />

          {task ? (
            <div className="border-t pt-4">
              <SubtaskChecklist taskId={task.id} subtasks={task.subtasks} />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || values.title.trim().length === 0}>
              {task ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
