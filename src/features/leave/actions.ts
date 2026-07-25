"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { allowanceSchema, leaveSchema, type LeaveInput } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateLeave(): void {
  revalidatePath("/leave");
  revalidatePath("/");
}

function firstError(issues: { message: string }[], fallback: string): string {
  return issues[0]?.message ?? fallback;
}

export async function setAllowance(
  year: number,
  totalDays: number,
  carryOverDays = 0,
): Promise<ActionResult> {
  const parsed = allowanceSchema.safeParse({ year, totalDays, carryOverDays });
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error.issues, "Invalid allowance") };
  }

  const carry = parsed.data.carryOverDays ?? 0;
  try {
    await db.leaveAllowance.upsert({
      where: { year: parsed.data.year },
      create: { year: parsed.data.year, totalDays: parsed.data.totalDays, carryOverDays: carry },
      update: { totalDays: parsed.data.totalDays, carryOverDays: carry },
    });
    revalidateLeave();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save allowance." };
  }
}

export async function createLeave(input: LeaveInput): Promise<ActionResult> {
  const parsed = leaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error.issues, "Invalid leave") };
  }

  try {
    await db.leave.create({
      data: {
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        type: parsed.data.type,
        halfDay: parsed.data.halfDay ?? false,
        notes: parsed.data.notes || null,
      },
    });
    revalidateLeave();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to log leave." };
  }
}

export async function updateLeave(id: string, input: LeaveInput): Promise<ActionResult> {
  const parsed = leaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error.issues, "Invalid leave") };
  }

  try {
    await db.leave.update({
      where: { id },
      data: {
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        type: parsed.data.type,
        halfDay: parsed.data.halfDay ?? false,
        notes: parsed.data.notes || null,
      },
    });
    revalidateLeave();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update leave." };
  }
}

export async function deleteLeave(id: string): Promise<ActionResult> {
  try {
    await db.leave.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidateLeave();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to delete leave." };
  }
}
