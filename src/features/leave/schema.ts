import { z } from "zod";
import { LEAVE_TYPES } from "@/types";

const dateOnly = z
  .string()
  .min(1, "Date is required")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const allowanceSchema = z.object({
  year: z.number().int(),
  totalDays: z.number().min(0, "Total days must be 0 or more"),
});

export type AllowanceInput = z.infer<typeof allowanceSchema>;

export const leaveSchema = z
  .object({
    startDate: dateOnly,
    endDate: dateOnly,
    type: z.enum(LEAVE_TYPES),
    notes: z.string().optional(),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

export type LeaveInput = z.infer<typeof leaveSchema>;
