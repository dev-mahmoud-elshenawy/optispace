"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TaskView } from "@/features/tasks/service";

import { DeleteTaskDialog } from "./delete-task-dialog";
import { TaskBoard } from "./task-board";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskList } from "./task-list";
import { TaskProjectGroups } from "./task-project-groups";

interface TasksViewProps {
  initialTasks: TaskView[];
  projectOptions: { id: string; name: string }[];
}

export function TasksView({ initialTasks, projectOptions }: TasksViewProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskView | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskView | null>(null);

  // Server actions revalidate the route; sync local state once fresh props arrive.
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  const allTags = useMemo(
    () => Array.from(new Set(tasks.flatMap((t) => t.tags))).sort((a, b) => a.localeCompare(b)),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (tagFilter === "all" || t.tags.includes(tagFilter)) &&
        (query === "" || t.title.toLowerCase().includes(query)),
    );
  }, [tasks, search, tagFilter]);

  // The board hands back only the tasks it was given (the filtered subset); merge
  // by id so tasks hidden by the filter are never dropped from the full state.
  function handleTasksChange(next: TaskView[]) {
    const byId = new Map(next.map((t) => [t.id, t]));
    setTasks((prev) => prev.map((t) => byId.get(t.id) ?? t));
  }

  function openCreate() {
    setEditingTask(null);
    setFormOpen(true);
  }

  function openEdit(task: TaskView) {
    setEditingTask(task);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="board">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="project">By Project</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              className="h-9 w-44"
            />
            {allTags.length > 0 ? (
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {allTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button onClick={openCreate}>
              <PlusIcon />
              Add Task
            </Button>
          </div>
        </div>

        <TabsContent value="board" className="mt-4">
          <TaskBoard tasks={filteredTasks} onTasksChange={handleTasksChange} onEdit={openEdit} onDelete={setDeletingTask} />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <TaskList tasks={filteredTasks} projectOptions={projectOptions} onEdit={openEdit} onDelete={setDeletingTask} />
        </TabsContent>

        <TabsContent value="project" className="mt-4">
          <TaskProjectGroups tasks={filteredTasks} onTasksChange={handleTasksChange} onEdit={openEdit} onDelete={setDeletingTask} />
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
