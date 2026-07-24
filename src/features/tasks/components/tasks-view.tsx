"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AzureDevOpsTaskDetail } from "@/features/integrations/azure-devops/task-detail";
import { GithubPrDetail } from "@/features/integrations/github/pr-detail";
import type { PullRequestView } from "@/features/integrations/github/types";
import { STATUS_LABELS, type TaskView } from "@/features/tasks/service";
import { TASK_STATUSES, type TaskStatus } from "@/types";

import { DeleteTaskDialog } from "./delete-task-dialog";
import { OPEN_PR_EVENT } from "./linked-pr-badge";
import { TaskBoard } from "./task-board";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskList } from "./task-list";
import { TaskProjectGroups } from "./task-project-groups";
import { TaskSprintGroups } from "./task-sprint-groups";

interface TasksViewProps {
  initialTasks: TaskView[];
  projectOptions: { id: string; name: string }[];
  pullRequests: PullRequestView[];
}

const ALL = "all";
const NO_PROJECT = "none";

export function TasksView({ initialTasks, projectOptions, pullRequests }: TasksViewProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>(ALL);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskView | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskView | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null); // open DevOps popup for this externalId
  const [detailStatusOnly, setDetailStatusOnly] = useState(false); // drag-to-move opens a slim state picker
  const [statusFilter, setStatusFilter] = useState<TaskStatus | typeof ALL>(ALL);
  const [sort, setSort] = useState<"manual" | "changed" | "added">("changed");
  const [noEffort, setNoEffort] = useState(false); // show only tasks with no effort/estimate
  const [openPr, setOpenPr] = useState<PullRequestView | null>(null); // in-app PR modal for a linked PR

  // Server actions revalidate the route; sync local state once fresh props arrive.
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  // A card/list PR badge fires optispace:open-pr → open the in-app PR modal here.
  useEffect(() => {
    const handler = (e: Event) => setOpenPr((e as CustomEvent<PullRequestView>).detail);
    window.addEventListener(OPEN_PR_EVENT, handler);
    return () => window.removeEventListener(OPEN_PR_EVENT, handler);
  }, []);

  // Resolve each task's attached PR from the cache by "repo#number" (once per PR-set change).
  const prByKey = useMemo(() => {
    const m = new Map<string, PullRequestView>();
    for (const pr of pullRequests) m.set(`${pr.repo}#${pr.number}`, pr);
    return m;
  }, [pullRequests]);

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
        (statusFilter === ALL || t.status === statusFilter) &&
        (!noEffort || (t.source === "azure_devops" && (t.effort == null || t.effort === 0))) &&
        (query === "" || t.title.toLowerCase().includes(query)),
    );
  }, [tasks, search, projectFilter, statusFilter, noEffort]);

  // Applied sort. "manual" keeps the Kanban order (board stays drag-orderable);
  // "changed" = most recently changed in ADO (falls back to local updatedAt);
  // "added" = newest first by creation. Sorting overrides board order by design.
  const viewTasks = useMemo(() => {
    let arr = filteredTasks;
    if (sort !== "manual") {
      arr = [...filteredTasks];
      if (sort === "added") {
        arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else {
        const changed = (t: TaskView) => (t.changedDate ?? t.updatedAt).getTime();
        arr.sort((a, b) => changed(b) - changed(a));
      }
    }
    // Attach the resolved PR so the card/list badge renders (null once merged/pruned from cache).
    return arr.map((t) =>
      t.linkedPrRepo && t.linkedPrNumber != null
        ? { ...t, linkedPr: prByKey.get(`${t.linkedPrRepo}#${t.linkedPrNumber}`) ?? null }
        : t,
    );
  }, [filteredTasks, sort, prByKey]);

  // The board hands back only the tasks it was given (the filtered subset); merge
  // by id so tasks hidden by the filter are never dropped from the full state.
  function handleTasksChange(next: TaskView[]) {
    const byId = new Map(next.map((t) => [t.id, t]));
    setTasks((prev) => prev.map((t) => byId.get(t.id) ?? t));
  }

  // Optimistic add-or-replace (create/edit) and remove (delete) — no refetch.
  function upsertTask(task: TaskView) {
    setTasks((prev) => {
      const i = prev.findIndex((t) => t.id === task.id);
      if (i === -1) return [task, ...prev];
      const next = [...prev];
      next[i] = task;
      return next;
    });
  }

  function removeTasks(ids: string[]) {
    const set = new Set(ids);
    setTasks((prev) => prev.filter((t) => !set.has(t.id)));
  }

  function openCreate() {
    setEditingTask(null);
    setFormOpen(true);
  }

  // Synced (DevOps) tasks open the DevOps editor everywhere; local tasks use the form.
  function openEdit(task: TaskView) {
    if (task.source === "azure_devops" && task.externalId) {
      setDetailStatusOnly(false);
      setDetailId(task.externalId);
      return;
    }
    setEditingTask(task);
    setFormOpen(true);
  }

  // Cross-column drag of a DevOps task: open the slim state picker (writes back to ADO).
  function openStatusPick(task: TaskView) {
    if (task.source === "azure_devops" && task.externalId) {
      setDetailStatusOnly(true);
      setDetailId(task.externalId);
    }
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
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | typeof ALL)}>
              <SelectTrigger size="sm">
                <SelectValue>{statusFilter === ALL ? "All statuses" : STATUS_LABELS[statusFilter]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger size="sm">
                <SelectValue>
                  {sort === "manual" ? "Manual (drag order)" : sort === "changed" ? "Recently changed" : "Recently added"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (drag order)</SelectItem>
                <SelectItem value="changed">Recently changed</SelectItem>
                <SelectItem value="added">Recently added</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={noEffort ? "default" : "outline"} size="sm" onClick={() => setNoEffort((v) => !v)}>
              No effort
            </Button>
            <Button onClick={openCreate}>
              <PlusIcon />
              Add Task
            </Button>
          </div>
        </div>

        <TabsContent value="board" className="mt-4">
          <TaskBoard tasks={viewTasks} sorted={sort !== "manual"} onTasksChange={handleTasksChange} onCreated={upsertTask} onEdit={openEdit} onDelete={setDeletingTask} onStatusPick={openStatusPick} />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <TaskList tasks={viewTasks} projectOptions={projectOptions} onEdit={openEdit} onDelete={setDeletingTask} onTasksChange={handleTasksChange} onRemove={removeTasks} />
        </TabsContent>

        <TabsContent value="project" className="mt-4">
          <TaskProjectGroups tasks={viewTasks} sorted={sort !== "manual"} onTasksChange={handleTasksChange} onCreated={upsertTask} onEdit={openEdit} onDelete={setDeletingTask} onStatusPick={openStatusPick} />
        </TabsContent>

        {hasSprintTasks ? (
          <TabsContent value="sprint" className="mt-4">
            <TaskSprintGroups tasks={viewTasks} onEdit={openEdit} onDelete={setDeletingTask} />
          </TabsContent>
        ) : null}
      </Tabs>

      {formOpen ? (
        <TaskFormDialog
          task={editingTask}
          projectOptions={projectOptions}
          pullRequests={pullRequests}
          onOpenChange={setFormOpen}
          onSaved={(t) => (t ? upsertTask(t) : router.refresh())}
        />
      ) : null}

      {deletingTask ? (
        <DeleteTaskDialog
          task={deletingTask}
          onOpenChange={(open) => !open && setDeletingTask(null)}
          onDeleted={(id) => removeTasks([id])}
        />
      ) : null}

      {detailId ? (
        <AzureDevOpsTaskDetail
          externalId={detailId}
          open
          statusOnly={detailStatusOnly}
          onOpenChange={(open) => {
            if (!open) {
              setDetailId(null);
              setDetailStatusOnly(false);
            }
          }}
        />
      ) : null}

      {openPr ? (
        <GithubPrDetail
          nodeId={openPr.nodeId}
          repo={openPr.repo}
          number={openPr.number}
          title={openPr.title}
          open
          onOpenChange={(o) => !o && setOpenPr(null)}
        />
      ) : null}
    </div>
  );
}
