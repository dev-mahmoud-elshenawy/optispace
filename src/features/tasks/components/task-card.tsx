"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRIORITY_BADGE_CLASS, type TaskView } from "@/features/tasks/service";

interface TaskCardProps {
  task: TaskView;
  onEdit: () => void;
  onDelete: () => void;
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab space-y-2 rounded-lg border border-border bg-card p-3 text-sm shadow-xs active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground">{task.title}</p>
        <div className="flex shrink-0 gap-1">
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
        <Badge className={PRIORITY_BADGE_CLASS[task.priority]}>{task.priority}</Badge>
        {task.dueDate ? (
          <span className="text-xs text-muted-foreground">{format(task.dueDate, "MMM d, yyyy")}</span>
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
    </div>
  );
}
