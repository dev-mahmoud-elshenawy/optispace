"use client";

import { useMemo, useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABELS, type TaskView } from "@/features/tasks/service";
import { deleteTasks, moveTasksToProject, setTasksStatus } from "@/features/tasks/actions";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/types";

import { TaskListTable, type SortKey } from "./task-list-table";

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { low: 0, medium: 1, high: 2 };
const ALL = "all";
const NO_PROJECT = "none";

interface TaskListProps {
  tasks: TaskView[];
  projectOptions: { id: string; name: string }[];
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
  // Optimistic bulk updates — merge changed rows / drop removed ones without a refetch.
  onTasksChange: (tasks: TaskView[]) => void;
  onRemove: (ids: string[]) => void;
}

export function TaskList({ tasks, projectOptions, onEdit, onDelete, onTasksChange, onRemove }: TaskListProps) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | typeof ALL>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | typeof ALL>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [isMoving, startMove] = useTransition();
  const [isBulk, startBulk] = useTransition();

  const rows = useMemo(() => {
    const filtered = tasks.filter((task) => {
      if (statusFilter !== ALL && task.status !== statusFilter) return false;
      if (priorityFilter !== ALL && task.priority !== priorityFilter) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "dueDate") diff = (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0);
      else if (sortKey === "priority") diff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      else if (sortKey === "changedDate") diff = (a.changedDate ?? a.updatedAt).getTime() - (b.changedDate ?? b.updatedAt).getTime();
      else if (sortKey === "effort") diff = (a.effort ?? -1) - (b.effort ?? -1);
      else diff = a.createdAt.getTime() - b.createdAt.getTime();
      return sortDesc ? -diff : diff;
    });
  }, [tasks, statusFilter, priorityFilter, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((prev) => !prev);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function move() {
    if (selected.size === 0 || moveTarget === "") return;
    const projectId = moveTarget === NO_PROJECT ? null : moveTarget;
    const projectName = projectId ? (projectOptions.find((p) => p.id === projectId)?.name ?? null) : null;
    const ids = [...selected];
    const count = ids.length;
    startMove(async () => {
      const result = await moveTasksToProject(ids, projectId);
      if (result.ok) {
        toast.success(`Moved ${count} task${count === 1 ? "" : "s"}.`);
        const idset = new Set(ids);
        onTasksChange(tasks.filter((t) => idset.has(t.id)).map((t) => ({ ...t, projectId, projectName })));
        setSelected(new Set());
      } else {
        toast.error(result.error);
      }
    });
  }

  // Status change and delete apply to local tasks only — sync owns ADO task status
  // and prunes ADO rows, so flipping/deleting synced tasks locally is pointless.
  const localSelectedIds = useMemo(
    () => rows.filter((r) => selected.has(r.id) && r.source !== "azure_devops").map((r) => r.id),
    [rows, selected],
  );
  const skipped = selected.size - localSelectedIds.length;

  function setStatus(status: TaskStatus) {
    if (localSelectedIds.length === 0) return;
    const count = localSelectedIds.length;
    const ids = localSelectedIds;
    startBulk(async () => {
      const result = await setTasksStatus(ids, status);
      if (result.ok) {
        toast.success(`Set ${count} task${count === 1 ? "" : "s"} to ${STATUS_LABELS[status]}.`);
        const idset = new Set(ids);
        onTasksChange(tasks.filter((t) => idset.has(t.id)).map((t) => ({ ...t, status })));
        setSelected(new Set());
      } else {
        toast.error(result.error);
      }
    });
  }

  function removeSelected() {
    if (localSelectedIds.length === 0) return;
    const count = localSelectedIds.length;
    const ids = localSelectedIds;
    startBulk(async () => {
      const result = await deleteTasks(ids);
      if (result.ok) {
        toast.success(`Deleted ${count} task${count === 1 ? "" : "s"}.`);
        onRemove(ids);
        setSelected(new Set());
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | typeof ALL)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
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

        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as TaskPriority | typeof ALL)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select value={moveTarget} onValueChange={setMoveTarget}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue placeholder="Move to project…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projectOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={move} disabled={isMoving || moveTarget === ""}>
            Move
          </Button>
          <Select value="" onValueChange={(v) => setStatus(v as TaskStatus)} disabled={isBulk || localSelectedIds.length === 0}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="destructive"
            onClick={removeSelected}
            disabled={isBulk || localSelectedIds.length === 0}
          >
            <Trash2Icon />
            Delete
          </Button>
          {skipped > 0 ? (
            <span className="text-xs text-muted-foreground">{skipped} Azure DevOps skipped</span>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No tasks yet — add your first task to get started.
        </p>
      ) : (
        <TaskListTable
          tasks={rows}
          sortKey={sortKey}
          sortDesc={sortDesc}
          onSort={toggleSort}
          onEdit={onEdit}
          onDelete={onDelete}
          selectedIds={selected}
          onToggle={toggleSelect}
          onToggleAll={toggleAll}
          allChecked={allChecked}
        />
      )}
    </div>
  );
}
