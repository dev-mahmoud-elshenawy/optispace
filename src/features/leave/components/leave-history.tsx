"use client";

import { format } from "date-fns";
import { PencilIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeaveView } from "../service";
import { DeleteLeaveDialog } from "./delete-leave-dialog";
import { LeaveFormDialog } from "./leave-form-dialog";
import { LEAVE_TYPE_BADGE_VARIANT, LEAVE_TYPE_LABELS } from "./leave-type-style";

interface LeaveHistoryProps {
  leaves: LeaveView[];
}

export function LeaveHistory({ leaves }: LeaveHistoryProps) {
  if (leaves.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No leave logged yet — log your first leave to see it here.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dates</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Days</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leaves.map((leave) => (
          <TableRow key={leave.id}>
            <TableCell>
              {format(leave.startDate, "MMM d, yyyy")}
              {leave.startDate.getTime() !== leave.endDate.getTime()
                ? ` – ${format(leave.endDate, "MMM d, yyyy")}`
                : ""}
            </TableCell>
            <TableCell>
              <Badge variant={LEAVE_TYPE_BADGE_VARIANT[leave.type]}>{LEAVE_TYPE_LABELS[leave.type]}</Badge>
            </TableCell>
            <TableCell>{leave.days}</TableCell>
            <TableCell className="max-w-64 truncate text-muted-foreground">{leave.notes ?? "—"}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <LeaveFormDialog
                  leave={leave}
                  trigger={
                    <Button variant="ghost" size="icon-sm">
                      <PencilIcon />
                      <span className="sr-only">Edit leave</span>
                    </Button>
                  }
                />
                <DeleteLeaveDialog leaveId={leave.id} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
