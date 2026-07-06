"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { profileSchema, type ProfileInput } from "@/features/profiles/schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateProfiles(): void {
  revalidatePath("/profiles");
  revalidatePath("/");
}

export async function createProfile(input: ProfileInput): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const order = await db.profile.count();
    await db.profile.create({
      data: {
        label: parsed.data.label,
        url: parsed.data.url,
        username: parsed.data.username || null,
        icon: parsed.data.icon ?? null,
        order,
      },
    });
    revalidateProfiles();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to create profile" };
  }
}

export async function updateProfile(id: string, input: ProfileInput): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await db.profile.update({
      where: { id },
      data: {
        label: parsed.data.label,
        url: parsed.data.url,
        username: parsed.data.username || null,
        icon: parsed.data.icon ?? null,
      },
    });
    revalidateProfiles();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update profile" };
  }
}

export async function deleteProfile(id: string): Promise<ActionResult> {
  try {
    await db.profile.delete({ where: { id } });
    revalidateProfiles();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to delete profile" };
  }
}
