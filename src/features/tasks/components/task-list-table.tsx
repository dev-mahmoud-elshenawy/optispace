"use client";

import { format } from "date-fns";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRIORITY_BADGE_CLASS, STATUS_LABELS, type TaskView } from "@/features/tasks/service";

export type SortKey = "dueDate" | "priority" | "createdAt";

interface TaskListTableProps {
  tasks: TaskView[];
  sortKey: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
  onEdit: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}

export function TaskListTable({ tasks, sortKey, sortDesc, onSort, onEdit, onDelete }: TaskListTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <SortableHead label="Priority" active={sortKey === "priority"} desc={sortDesc} onClick={() => onSort("priority")} />
          <SortableHead label="Due date" active={sortKey === "dueDate"} desc={sortDesc} onClick={() => onSort("dueDate")} />
          <TableHead>Tags</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell className="font-medium">{task.title}</TableCell>
            <TableCell>{STATUS_LABELS[task.status]}</TableCell>
            <TableCell>
              <Badge className={PRIORITY_BADGE_CLASS[task.priority]}>{task.priority}</Badge>
            </TableCell>
            <TableCell>{task.dueDate ? format(task.dueDate, "MMM d, yyyy") : "—"}</TableCell>
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
              <Button variant="ghost" size="icon-xs" onClick={() => onEdit(task)}>
                <PencilIcon />
                <span className="sr-only">Edit</span>
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => onDelete(task)}>
                <Trash2Icon />
                <span className="sr-only">Delete</span>
              </Button>
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
