"use client";

import { useTransition } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";

import { moveTask } from "@/features/tasks/actions";
import type { TaskView } from "@/features/tasks/service";
import { TASK_STATUSES, type TaskStatus } from "@/types";

import { TaskColumn } from "./task-column";

interface TaskBoardProps {
  tasks: TaskView[];
  onTasksChange: (tasks: TaskView[]) => void;
  // Quick-add hands the new (optimistic) task up so the parent can add it to state.
  onCreated?: (task: TaskView) => void;
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
  // Cross-column drag of a DevOps task calls this (slim state picker) if given.
  onStatusPick?: (task: TaskView) => void;
  // When true, keep the given task order (a chosen sort) instead of Kanban order.
  sorted?: boolean;
  id?: string;
}

function statusOf(id: string, tasks: TaskView[]): TaskStatus | null {
  if (id.startsWith("column-")) return id.replace("column-", "") as TaskStatus;
  return tasks.find((t) => t.id === id)?.status ?? null;
}

export function TaskBoard({ tasks, onTasksChange, onCreated, onEdit, onDelete, onStatusPick, sorted = false, id = "task-board" }: TaskBoardProps) {
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    if (overId === String(active.id)) return; // dropped on itself — no-op

    const activeTask = tasks.find((t) => t.id === active.id);
    const targetStatus = statusOf(overId, tasks);
    if (!activeTask || !targetStatus) return;

    // Azure DevOps owns the status, and a 3-column board can't pick the specific
    // ADO state. So a cross-column drag of a synced task opens the detail editor's
    // state picker (real allowed states, writes back to ADO) instead of silently
    // flipping local status. Same-column reordering still falls through below.
    if (targetStatus !== activeTask.status && activeTask.source === "azure_devops") {
      (onStatusPick ?? onEdit)(activeTask);
      return;
    }

    const destTasks = tasks
      .filter((t) => t.status === targetStatus && t.id !== activeTask.id)
      .sort((a, b) => a.order - b.order);
    const overIndex = overId.startsWith("column-") ? -1 : destTasks.findIndex((t) => t.id === overId);
    const insertIndex = overIndex === -1 ? destTasks.length : overIndex;

    // Rebuild the destination column with the dragged card inserted, then assign
    // contiguous orders so sibling positions never collide (the reorder bug).
    const orderedIds = destTasks.map((t) => t.id);
    orderedIds.splice(insertIndex, 0, activeTask.id);
    const orderOf = new Map(orderedIds.map((id, index) => [id, index]));

    const previousTasks = tasks;
    const updatedTasks = tasks.map((t) => {
      if (t.id === activeTask.id) return { ...t, status: targetStatus, order: orderOf.get(t.id) ?? t.order };
      return orderOf.has(t.id) ? { ...t, order: orderOf.get(t.id) as number } : t;
    });
    onTasksChange(updatedTasks);

    startTransition(async () => {
      const result = await moveTask(activeTask.id, targetStatus, orderedIds);
      if (!result.ok) {
        toast.error(result.error);
        onTasksChange(previousTasks);
      }
    });
  }

  return (
    <DndContext id={id} sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4 md:flex-row">
        {TASK_STATUSES.map((status) => (
          <TaskColumn
            key={status}
            status={status}
            tasks={
              sorted
                ? tasks.filter((t) => t.status === status)
                : tasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order)
            }
            onCreated={onCreated}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </DndContext>
  );
}
