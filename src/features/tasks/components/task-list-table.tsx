"use client";

import { format } from "date-fns";
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_LABELS, type TaskView } from "@/features/tasks/service";
import { PriorityFlag } from "./priority-flag";

export type SortKey = "dueDate" | "priority" | "createdAt" | "changedDate" | "effort";

interface TaskListTableProps {
  tasks: TaskView[];
  sortKey: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  allChecked?: boolean;
}

export function TaskListTable({
  tasks,
  sortKey,
  sortDesc,
  onSort,
  onEdit,
  onDelete,
  selectedIds,
  onToggle,
  onToggleAll,
  allChecked,
}: TaskListTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {onToggle ? (
            <TableHead className="w-8">
              <Checkbox checked={allChecked} onCheckedChange={onToggleAll} aria-label="Select all" />
            </TableHead>
          ) : null}
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <SortableHead label="Priority" active={sortKey === "priority"} desc={sortDesc} onClick={() => onSort("priority")} />
          <SortableHead label="Due date" active={sortKey === "dueDate"} desc={sortDesc} onClick={() => onSort("dueDate")} />
          <SortableHead label="Effort" active={sortKey === "effort"} desc={sortDesc} onClick={() => onSort("effort")} />
          <SortableHead label="Changed" active={sortKey === "changedDate"} desc={sortDesc} onClick={() => onSort("changedDate")} />
          <TableHead>Tags</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            {onToggle ? (
              <TableCell className="w-8">
                <Checkbox
                  checked={selectedIds?.has(task.id) ?? false}
                  onCheckedChange={() => onToggle(task.id)}
                  aria-label={`Select ${task.title}`}
                />
              </TableCell>
            ) : null}
            <TableCell className="font-medium">
              <button type="button" className="text-left hover:text-primary hover:underline" onClick={() => onEdit(task)}>
                {task.title}
              </button>
            </TableCell>
            <TableCell>{STATUS_LABELS[task.status]}</TableCell>
            <TableCell>
              <PriorityFlag priority={task.priority} />
            </TableCell>
            <TableCell>{task.dueDate ? format(task.dueDate, "MMM d, yyyy") : "—"}</TableCell>
            <TableCell className="tabular-nums">{task.effort ?? "—"}</TableCell>
            <TableCell>{task.changedDate ? format(task.changedDate, "MMM d, yyyy") : "—"}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-right">
              {task.source !== "azure_devops" ? (
                <Button variant="ghost" size="icon-xs" onClick={() => onDelete(task)}>
                  <Trash2Icon />
                  <span className="sr-only">Delete</span>
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SortableHead({
  label,
  active,
  desc,
  onClick,
}: {
  label: string;
  active: boolean;
  desc: boolean;
  onClick: () => void;
}) {
  return (
    <TableHead>
      <button type="button" onClick={onClick} className="flex items-center gap-1 hover:text-foreground">
        {label}
        {active ? desc ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" /> : null}
      </button>
    </TableHead>
  );
}
