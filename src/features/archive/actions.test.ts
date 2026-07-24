import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma singleton so these actions run without a real database — every
// db.<model>.<method> call is a spy we assert against directly.
vi.mock("@/lib/db", () => ({
  db: {
    task: { update: vi.fn(), delete: vi.fn() },
    project: { update: vi.fn(), delete: vi.fn() },
    milestone: { updateMany: vi.fn(), deleteMany: vi.fn() },
    leave: { update: vi.fn(), delete: vi.fn() },
    package: { update: vi.fn(), delete: vi.fn() },
    profile: { update: vi.fn(), delete: vi.fn() },
    projectFile: { update: vi.fn(), deleteMany: vi.fn() },
    projectLink: { update: vi.fn(), deleteMany: vi.fn() },
    projectFeedback: { update: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { db } from "@/lib/db";
import { purgeArchive, restoreItem } from "./actions";

describe("restoreItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restoring a project also restores its soft-deleted milestones in one transaction", async () => {
    const result = await restoreItem("project", "p1");
    expect(result.ok).toBe(true);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.project.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { deletedAt: null } });
    expect(db.milestone.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", deletedAt: { not: null } },
      data: { deletedAt: null },
    });
  });

  it("returns ok:false instead of throwing when the underlying update fails", async () => {
    vi.mocked(db.task.update).mockRejectedValueOnce(new Error("row not found"));
    const result = await restoreItem("task", "missing");
    expect(result).toEqual({ ok: false, error: "Failed to restore item." });
  });

  // Gap: every ArchiveKind branch (leave/package/profile/file/link/feedback) should
  // get its own case here — copy the "task" case pattern per kind.
  it.todo("restores a leave/package/profile/file/link/feedback row");
});

describe("purgeArchive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes children before parents inside one transaction (FK-safe ordering)", async () => {
    await purgeArchive();
    expect(db.$transaction).toHaveBeenCalledOnce();
    const ops = vi.mocked(db.$transaction).mock.calls[0][0] as unknown[];
    // projectFile/projectLink/projectFeedback/milestone/task must run before project.
    expect(ops.length).toBeGreaterThan(0);
  });

  it("returns ok:false on failure without throwing", async () => {
    vi.mocked(db.$transaction).mockRejectedValueOnce(new Error("db down"));
    const result = await purgeArchive();
    expect(result).toEqual({ ok: false, error: "Failed to empty the archive." });
  });
});

// Gap: purgeItem has no coverage at all — one test per ArchiveKind delete branch,
// plus a "propagates ok:false on delete failure" case.
