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
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}

function statusOf(id: string, tasks: TaskView[]): TaskStatus | null {
  if (id.startsWith("column-")) return id.replace("column-", "") as TaskStatus;
  return tasks.find((t) => t.id === id)?.status ?? null;
}

export function TaskBoard({ tasks, onTasksChange, onEdit, onDelete }: TaskBoardProps) {
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    const targetStatus = statusOf(String(over.id), tasks);
    if (!activeTask || !targetStatus) return;

    const overId = String(over.id);
    const destTasks = tasks
      .filter((t) => t.status === targetStatus && t.id !== activeTask.id)
      .sort((a, b) => a.order - b.order);
    const overIndex = overId.startsWith("column-") ? -1 : destTasks.findIndex((t) => t.id === overId);
    const insertIndex = overIndex === -1 ? destTasks.length : overIndex;

    const previousTasks = tasks;
    const updatedTasks = tasks.map((t) =>
      t.id === activeTask.id ? { ...t, status: targetStatus, order: insertIndex } : t
    );
    onTasksChange(updatedTasks);

    if (activeTask.status !== targetStatus || activeTask.order !== insertIndex) {
      startTransition(async () => {
        const result = await moveTask(activeTask.id, targetStatus, insertIndex);
        if (!result.ok) {
          toast.error(result.error);
          onTasksChange(previousTasks);
        }
      });
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4 md:flex-row">
        {TASK_STATUSES.map((status) => (
          <TaskColumn
            key={status}
            status={status}
            tasks={tasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </DndContext>
  );
}
