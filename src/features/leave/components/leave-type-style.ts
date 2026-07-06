import type { LeaveType } from "@/types";

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: "Annual",
  sick: "Sick",
  casual: "Casual",
};

export const LEAVE_TYPE_BADGE_VARIANT: Record<LeaveType, "default" | "destructive" | "secondary"> = {
  annual: "default",
  sick: "destructive",
  casual: "secondary",
};

// Subtle background + matching text, same token pattern as the destructive badge/button variants.
export const LEAVE_TYPE_CELL_CLASS: Record<LeaveType, string> = {
  annual: "bg-primary/15 text-primary dark:bg-primary/25",
  sick: "bg-destructive/15 text-destructive dark:bg-destructive/25",
  casual: "bg-secondary text-secondary-foreground",
};

export const LEAVE_TYPE_DOT_CLASS: Record<LeaveType, string> = {
  annual: "bg-primary",
  sick: "bg-destructive",
  casual: "bg-secondary-foreground",
};
