"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AzureDevOpsTaskDetail } from "@/features/integrations/azure-devops/task-detail";
import type { TaskView } from "@/features/tasks/service";

import { DeleteTaskDialog } from "./delete-task-dialog";
import { TaskBoard } from "./task-board";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskList } from "./task-list";
import { TaskProjectGroups } from "./task-project-groups";
import { TaskSprintGroups } from "./task-sprint-groups";

interface TasksViewProps {
  initialTasks: TaskView[];
  projectOptions: { id: string; name: string }[];
}

const ALL = "all";
const NO_PROJECT = "none";

export function TasksView({ initialTasks, projectOptions }: TasksViewProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>(ALL);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskView | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskView | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null); // open DevOps popup for this externalId

  // Server actions revalidate the route; sync local state once fresh props arrive.
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  const hasProjectTasks = useMemo(() => tasks.some((t) => t.projectId), [tasks]);
  const hasSprintTasks = useMemo(() => tasks.some((t) => t.iterationPath), [tasks]);
  const projectLabel =
    projectFilter === ALL
      ? "All projects"
      : projectFilter === NO_PROJECT
        ? "No project"
        : (projectOptions.find((p) => p.id === projectFilter)?.name ?? "Project");

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (projectFilter === ALL ||
          (projectFilter === NO_PROJECT ? !t.projectId : t.projectId === projectFilter)) &&
        (query === "" || t.title.toLowerCase().includes(query)),
    );
  }, [tasks, search, projectFilter]);

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

  // Synced (DevOps) tasks open the DevOps editor everywhere; local tasks use the form.
  function openEdit(task: TaskView) {
    if (task.source === "azure_devops" && task.externalId) {
      setDetailId(task.externalId);
      return;
    }
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
            {hasSprintTasks ? <TabsTrigger value="sprint">By Sprint</TabsTrigger> : null}
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              className="h-9 w-44"
            />
            {hasProjectTasks || projectOptions.length > 0 ? (
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger size="sm">
                  <SelectValue>{projectLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All projects</SelectItem>
                  <SelectItem value={NO_PROJECT}>No project</SelectItem>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
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

        {hasSprintTasks ? (
          <TabsContent value="sprint" className="mt-4">
            <TaskSprintGroups tasks={filteredTasks} onEdit={openEdit} onDelete={setDeletingTask} />
          </TabsContent>
        ) : null}
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

      {detailId ? (
        <AzureDevOpsTaskDetail
          externalId={detailId}
          open
          onOpenChange={(open) => {
            if (!open) setDetailId(null);
          }}
        />
      ) : null}
    </div>
  );
}
