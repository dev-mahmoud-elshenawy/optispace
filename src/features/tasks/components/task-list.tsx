"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABELS, type TaskView } from "@/features/tasks/service";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/types";

import { TaskListTable, type SortKey } from "./task-list-table";

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { low: 0, medium: 1, high: 2 };
const ALL = "all";

interface TaskListProps {
  tasks: TaskView[];
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}

export function TaskList({ tasks, onEdit, onDelete }: TaskListProps) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | typeof ALL>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | typeof ALL>(ALL);
  const [tagSearch, setTagSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDesc, setSortDesc] = useState(true);

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
        />
      )}
    </div>
  );
}
