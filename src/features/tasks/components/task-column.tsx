"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { createTask } from "@/features/tasks/actions";
import { STATUS_DOT_CLASS, STATUS_LABELS, type TaskView } from "@/features/tasks/service";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types";

import { TaskCard } from "./task-card";

export function columnDroppableId(status: TaskStatus): string {
  return `column-${status}`;
}


interface TaskColumnProps {
  status: TaskStatus;
  tasks: TaskView[];
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}

export function TaskColumn({ status, tasks, onEdit, onDelete }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(status) });
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    startTransition(async () => {
      const result = await createTask({ title: trimmed, status, priority: "medium" });
      if (result.ok) {
        setTitle(""); // keep the input open for rapid entry, Notion-style
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", STATUS_DOT_CLASS[status])} />
          <h2 className="text-sm font-semibold text-foreground">{STATUS_LABELS[status]}</h2>
        </div>
        <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-md transition-colors",
          isOver && "bg-accent/50"
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />
          ))}
        </SortableContext>
      </div>

      {adding ? (
        <input
          autoFocus
          value={title}
          disabled={pending}
          placeholder="Task title…"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setTitle("");
              setAdding(false);
            }
          }}
          onBlur={() => {
            if (!title.trim()) setAdding(false);
          }}
          className="rounded-md border border-border bg-card px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <PlusIcon className="h-4 w-4" />
          New
        </button>
      )}
    </div>
  );
}
