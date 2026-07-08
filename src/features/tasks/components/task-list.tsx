"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABELS, type TaskView } from "@/features/tasks/service";
import { moveTasksToProject } from "@/features/tasks/actions";
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
}

export function TaskList({ tasks, projectOptions, onEdit, onDelete }: TaskListProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | typeof ALL>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | typeof ALL>(ALL);
  const [tagSearch, setTagSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [isMoving, startMove] = useTransition();

  const rows = useMemo(() => {
    const search = tagSearch.trim().toLowerCase();
    const filtered = tasks.filter((task) => {
      if (statusFilter !== ALL && task.status !== statusFilter) return false;
      if (priorityFilter !== ALL && task.priority !== priorityFilter) return false;
      if (search && !task.tags.some((tag) => tag.toLowerCase().includes(search))) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "dueDate") diff = (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0);
      else if (sortKey === "priority") diff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      else diff = a.createdAt.getTime() - b.createdAt.getTime();
      return sortDesc ? -diff : diff;
    });
  }, [tasks, statusFilter, priorityFilter, tagSearch, sortKey, sortDesc]);

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
    const count = selected.size;
    startMove(async () => {
      const result = await moveTasksToProject([...selected], projectId);
      if (result.ok) {
        toast.success(`Moved ${count} task${count === 1 ? "" : "s"}.`);
        setSelected(new Set());
        router.refresh();
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

        <Input
          value={tagSearch}
          onChange={(e) => setTagSearch(e.target.value)}
          placeholder="Search by tag…"
          className="w-48"
        />
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
