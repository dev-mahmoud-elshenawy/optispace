import { z } from "zod";
import { PROJECT_PLATFORMS, PROJECT_STATUSES } from "@/types";

export const projectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  repoUrl: z.string().nullable(),
  platform: z.enum(PROJECT_PLATFORMS),
  status: z.enum(PROJECT_STATUSES),
  progressPct: z
    .number()
    .int("Progress must be a whole number")
    .min(0, "Progress must be at least 0")
    .max(100, "Progress must be at most 100"),
  notes: z.string().nullable(),
});

export type ProjectInput = z.infer<typeof projectSchema>;

export const milestoneTitleSchema = z.string().min(1, "Title is required");
