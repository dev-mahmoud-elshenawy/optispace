import type { LeaveType } from "@/types";

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: "Annual",
};

export const LEAVE_TYPE_BADGE_VARIANT: Record<LeaveType, "default" | "destructive" | "secondary"> = {
  annual: "default",
};

// Subtle background + matching text, same token pattern as the destructive badge/button variants.
export const LEAVE_TYPE_CELL_CLASS: Record<LeaveType, string> = {
  annual: "bg-primary/15 text-primary dark:bg-primary/25",
};

export const LEAVE_TYPE_DOT_CLASS: Record<LeaveType, string> = {
  annual: "bg-primary",
};
