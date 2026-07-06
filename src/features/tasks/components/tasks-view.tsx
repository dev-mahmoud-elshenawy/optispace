"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TaskView } from "@/features/tasks/service";

import { DeleteTaskDialog } from "./delete-task-dialog";
import { TaskBoard } from "./task-board";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskList } from "./task-list";

interface TasksViewProps {
  initialTasks: TaskView[];
  projectOptions: { id: string; name: string }[];
}

export function TasksView({ initialTasks, projectOptions }: TasksViewProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskView | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskView | null>(null);

  // Server actions revalidate the route; sync local state once fresh props arrive.
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  function openCreate() {
    setEditingTask(null);
    setFormOpen(true);
  }

  function openEdit(task: TaskView) {
    setEditingTask(task);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="board">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>
          <Button onClick={openCreate}>
            <PlusIcon />
            Add Task
          </Button>
        </div>

        <TabsContent value="board" className="mt-4">
          <TaskBoard tasks={tasks} onTasksChange={setTasks} onEdit={openEdit} onDelete={setDeletingTask} />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <TaskList tasks={tasks} onEdit={openEdit} onDelete={setDeletingTask} />
        </TabsContent>
      </Tabs>

      {formOpen ? (
        <TaskFormDialog
          task={editingTask}
          projectOptions={projectOptions}
          onOpenChange={setFormOpen}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {deletingTask ? (
        <DeleteTaskDialog
          task={deletingTask}
          onOpenChange={(open) => !open && setDeletingTask(null)}
          onDeleted={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
