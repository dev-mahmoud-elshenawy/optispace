import { z } from "zod";

import { TASK_PRIORITIES, TASK_STATUSES } from "@/types";

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z.string().trim().optional(),
  projectId: z.string().trim().optional(),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export const subtaskTitleSchema = z.string().trim().min(1, "Subtask title is required");

export const moveTaskSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(TASK_STATUSES),
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});
