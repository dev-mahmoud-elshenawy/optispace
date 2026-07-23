import { db } from "@/lib/db";
import { STATUS_LABELS } from "@/features/tasks/service";
import { type TaskStatus } from "@/types";

// Markdown status report for one project — milestones, tasks by status, feedback, links.
// Dates are rendered as UTC calendar dates (YYYY-MM-DD); the file is a snapshot, not a UI.
function ymd(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "—";
}

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const project = await db.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      milestones: { where: { deletedAt: null }, orderBy: { order: "asc" } },
      tasks: { where: { deletedAt: null }, orderBy: { order: "asc" } },
      links: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      feedback: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return new Response("Project not found.", { status: 404 });

  const now = new Date();
  const lines: string[] = [];
  lines.push(`# ${project.name}`);
  lines.push("");
  lines.push(`- **Status:** ${project.status}`);
  lines.push(`- **Platform:** ${project.platform}`);
  if (project.repoUrl) lines.push(`- **Repo:** ${project.repoUrl}`);
  lines.push(`- **Generated:** ${now.toISOString()}`);
  if (project.notes) {
    lines.push("");
    lines.push(project.notes);
  }

  const doneM = project.milestones.filter((m) => m.done).length;
  lines.push("", `## Milestones (${doneM}/${project.milestones.length})`, "");
  if (project.milestones.length === 0) lines.push("_None._");
  for (const m of project.milestones) {
    const overdue = !m.done && m.dueDate && m.dueDate.getTime() < now.getTime();
    const due = m.dueDate ? ` (due ${ymd(m.dueDate)}${overdue ? " — OVERDUE" : ""})` : "";
    lines.push(`- [${m.done ? "x" : " "}] ${m.title}${due}`);
  }

  lines.push("", "## Tasks", "");
  const byStatus = new Map<string, typeof project.tasks>();
  for (const t of project.tasks) {
    const arr = byStatus.get(t.status) ?? [];
    arr.push(t);
    byStatus.set(t.status, arr);
  }
  if (project.tasks.length === 0) lines.push("_None._");
  for (const status of ["todo", "in_progress", "done"] as TaskStatus[]) {
    const arr = byStatus.get(status);
    if (!arr || arr.length === 0) continue;
    lines.push(`### ${STATUS_LABELS[status]} (${arr.length})`);
    for (const t of arr) {
      const due = t.dueDate ? ` — due ${ymd(t.dueDate)}` : "";
      lines.push(`- ${t.title}${due}`);
    }
    lines.push("");
  }

  if (project.feedback.length > 0) {
    lines.push("## Client feedback", "");
    for (const f of project.feedback) {
      const meta = [f.from, f.release].filter(Boolean).join(", ");
      lines.push(`- ${f.message}${meta ? ` _(${meta})_` : ""}`);
    }
    lines.push("");
  }

  if (project.links.length > 0) {
    lines.push("## Links", "");
    for (const l of project.links) {
      lines.push(`- [${l.label}](${l.url}) — ${l.type}`);
    }
    lines.push("");
  }

  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-report.md"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
