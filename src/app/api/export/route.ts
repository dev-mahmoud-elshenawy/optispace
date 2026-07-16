import { db } from "@/lib/db";

// Per-module data export. Complements the full JSON backup with focused,
// spreadsheet-friendly CSV (and JSON) dumps of a single module.
const LOADERS: Record<string, () => Promise<Record<string, unknown>[]>> = {
  tasks: () =>
    db.task.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, order: true, projectId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  packages: () =>
    db.package.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, description: true, registry: true, language: true, currentVersion: true, latestVersion: true, weeklyDownloads: true, tags: true, status: true, createdAt: true },
      orderBy: { name: "asc" },
    }),
  profiles: () =>
    db.profile.findMany({
      where: { deletedAt: null },
      select: { id: true, label: true, url: true, username: true, icon: true, order: true, createdAt: true },
      orderBy: { order: "asc" },
    }),
  leaves: () =>
    db.leave.findMany({
      where: { deletedAt: null },
      select: { id: true, startDate: true, endDate: true, type: true, notes: true, createdAt: true },
      orderBy: { startDate: "desc" },
    }),
  projects: () =>
    db.project.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, repoUrl: true, platform: true, status: true, notes: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
};

function csvCell(value: unknown): string {
  if (value == null) return "";
  const raw = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((col) => csvCell(row[col])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const module = url.searchParams.get("module") ?? "";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

  const loader = LOADERS[module];
  if (!loader) {
    return new Response(`Unknown module. Try one of: ${Object.keys(LOADERS).join(", ")}`, { status: 400 });
  }

  const rows = await loader();
  const body = format === "csv" ? toCsv(rows) : JSON.stringify(rows, null, 2);
  const contentType = format === "csv" ? "text/csv; charset=utf-8" : "application/json";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="optispace-${module}.${format}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
