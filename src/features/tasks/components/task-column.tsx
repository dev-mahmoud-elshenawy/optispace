"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { STATUS_LABELS, type TaskView } from "@/features/tasks/service";
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

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{STATUS_LABELS[status]}</h2>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-md transition-colors",
          isOver && "bg-accent/50"
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No tasks here yet.
            </p>
          ) : (
            tasks.map((task) => (
              <TaskCard key={task.id} task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
