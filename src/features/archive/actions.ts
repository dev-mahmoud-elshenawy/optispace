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
      case "link":
        await db.projectLink.update({ where: { id }, data: { deletedAt: null } });
        revalidatePath("/projects");
        break;
      case "feedback":
        await db.projectFeedback.update({ where: { id }, data: { deletedAt: null } });
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

export async function purgeItem(kind: ArchiveKind, id: string): Promise<ActionResult> {
  try {
    switch (kind) {
      case "task":
        await db.task.delete({ where: { id } });
        break;
      case "leave":
        await db.leave.delete({ where: { id } });
        break;
      case "project":
        // Cascades to milestones/files; unlinks tasks/packages (per schema FK rules).
        await db.project.delete({ where: { id } });
        break;
      case "package":
        await db.package.delete({ where: { id } });
        break;
      case "profile":
        await db.profile.delete({ where: { id } });
        break;
      case "file":
        await db.projectFile.delete({ where: { id } });
        break;
      case "link":
        await db.projectLink.delete({ where: { id } });
        break;
      case "feedback":
        await db.projectFeedback.delete({ where: { id } });
        break;
    }
    revalidatePath("/archive");
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to delete item permanently." };
  }
}

export async function purgeArchive(): Promise<ActionResult> {
  const deleted = { deletedAt: { not: null } };
  try {
    // Children before parents so cascades don't fight ordering.
    await db.$transaction([
      db.projectFile.deleteMany({ where: deleted }),
      db.projectLink.deleteMany({ where: deleted }),
      db.projectFeedback.deleteMany({ where: deleted }),
      db.milestone.deleteMany({ where: deleted }),
      db.task.deleteMany({ where: deleted }),
      db.package.deleteMany({ where: deleted }),
      db.leave.deleteMany({ where: deleted }),
      db.profile.deleteMany({ where: deleted }),
      db.project.deleteMany({ where: deleted }),
    ]);
    revalidatePath("/archive");
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to empty the archive." };
  }
}
