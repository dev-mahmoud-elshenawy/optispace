import { db } from "@/lib/db";

// Full data export — every table, including soft-deleted rows, so a backup is
// complete and restorable. ProjectFile bytes are base64-encoded for JSON.
export async function GET(): Promise<Response> {
  const [
    leaveAllowances,
    leaves,
    profiles,
    projects,
    milestones,
    tasks,
    packages,
    projectFiles,
    projectLinks,
    projectFeedback,
    feedbackAttachments,
  ] = await Promise.all([
    db.leaveAllowance.findMany(),
    db.leave.findMany(),
    db.profile.findMany(),
    db.project.findMany(),
    db.milestone.findMany(),
    db.task.findMany(),
    db.package.findMany(),
    db.projectFile.findMany(),
    db.projectLink.findMany(),
    db.projectFeedback.findMany(),
    db.feedbackAttachment.findMany(),
  ]);

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      leaveAllowances,
      leaves,
      profiles,
      projects,
      milestones,
      tasks,
      packages,
      projectFiles: projectFiles.map((f) => ({
        ...f,
        data: Buffer.from(f.data).toString("base64"),
      })),
      projectLinks,
      projectFeedback,
      feedbackAttachments: feedbackAttachments.map((a) => ({
        ...a,
        data: Buffer.from(a.data).toString("base64"),
      })),
    },
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="optispace-backup-${stamp}.json"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
