"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { ListChecks, PencilIcon, Repeat, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type TaskView } from "@/features/tasks/service";
import { AzureDevOpsTaskDetail } from "@/features/integrations/azure-devops/task-detail";
import { PriorityFlag } from "./priority-flag";

interface TaskCardProps {
  task: TaskView;
  onEdit: () => void;
  onDelete: () => void;
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const [detailOpen, setDetailOpen] = useState(false);
  const isSynced = task.source === "azure_devops" && Boolean(task.externalId);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "group cursor-grab space-y-2 rounded-lg bg-card p-4 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {isSynced ? (
          <button
            type="button"
            className="min-w-0 flex-1 text-left font-medium text-foreground hover:text-primary hover:underline"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setDetailOpen(true);
            }}
          >
            {task.title}
          </button>
        ) : (
          <p className="font-medium text-foreground">{task.title}</p>
        )}
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button variant="ghost" size="icon-xs" onPointerDown={(e) => e.stopPropagation()} onClick={onEdit}>
            <PencilIcon />
            <span className="sr-only">Edit</span>
          </Button>
          <Button variant="ghost" size="icon-xs" onPointerDown={(e) => e.stopPropagation()} onClick={onDelete}>
            <Trash2Icon />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityFlag priority={task.priority} />
        {task.dueDate ? (
          <span
            className={
              task.status !== "done" && task.dueDate < new Date(new Date().setHours(0, 0, 0, 0))
                ? "text-xs font-medium text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {format(task.dueDate, "MMM d, yyyy")}
          </span>
        ) : null}
        {task.recurrence !== "none" ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground capitalize">
            <Repeat className="size-3.5" />
            {task.recurrence}
          </span>
        ) : null}
        {task.subtasks.length > 0 ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <ListChecks className="size-3.5" />
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
          </span>
        ) : null}
      </div>

      {task.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {isSynced && task.externalId ? (
        <AzureDevOpsTaskDetail externalId={task.externalId} open={detailOpen} onOpenChange={setDetailOpen} />
      ) : null}
    </div>
  );
}
