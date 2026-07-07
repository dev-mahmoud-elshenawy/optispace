"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { ArchiveKind } from "./types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function restoreItem(kind: ArchiveKind, id: string): Promise<ActionResult> {
  try {
    switch (kind) {
      case "task":
        await db.task.update({ where: { id }, data: { deletedAt: null } });
        revalidatePath("/tasks");
        break;
      case "leave":
        await db.leave.update({ where: { id }, data: { deletedAt: null } });
        revalidatePath("/leave");
        break;
      case "project":
        // Bring the project back along with the milestones deleted with it.
        // Tasks/packages were unlinked on delete and can't be auto-relinked.
        await db.$transaction([
          db.project.update({ where: { id }, data: { deletedAt: null } }),
          db.milestone.updateMany({ where: { projectId: id, deletedAt: { not: null } }, data: { deletedAt: null } }),
        ]);
        revalidatePath("/projects");
        break;
      case "package":
        await db.package.update({ where: { id }, data: { deletedAt: null } });
        revalidatePath("/packages");
        break;
      case "profile":
        await db.profile.update({ where: { id }, data: { deletedAt: null } });
        revalidatePath("/profiles");
        break;
      case "file":
        await db.projectFile.update({ where: { id }, data: { deletedAt: null } });
        revalidatePath("/projects");
        break;
    }
    revalidatePath("/archive");
    revalidatePath("/");
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to restore item." };
  }
}
