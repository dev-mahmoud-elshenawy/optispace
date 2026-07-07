import { Flag } from "lucide-react";

import { cn } from "@/lib/utils";
import { PRIORITY_FLAG_CLASS } from "@/features/tasks/service";
import type { TaskPriority } from "@/types";

export function PriorityFlag({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium capitalize",
        PRIORITY_FLAG_CLASS[priority]
      )}
    >
      <Flag className="h-3 w-3 fill-current" />
      {priority}
    </span>
  );
}
