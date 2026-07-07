import "server-only";
import { format } from "date-fns";
import { db } from "@/lib/db";
import type { ArchivedItem } from "./types";

export type { ArchiveKind, ArchivedItem } from "./types";
export { archiveKindLabel } from "./types";

export async function listArchived(): Promise<ArchivedItem[]> {
  const deleted = { deletedAt: { not: null } };
  const [tasks, leaves, projects, packages, profiles, files] = await Promise.all([
    db.task.findMany({ where: deleted, select: { id: true, title: true, deletedAt: true } }),
    db.leave.findMany({ where: deleted, select: { id: true, startDate: true, endDate: true, deletedAt: true } }),
    db.project.findMany({ where: deleted, select: { id: true, name: true, deletedAt: true } }),
    db.package.findMany({ where: deleted, select: { id: true, name: true, deletedAt: true } }),
    db.profile.findMany({ where: deleted, select: { id: true, label: true, deletedAt: true } }),
    db.projectFile.findMany({ where: deleted, select: { id: true, name: true, deletedAt: true } }),
  ]);

  const items: ArchivedItem[] = [
    ...tasks.map((t) => ({ kind: "task" as const, id: t.id, label: t.title, deletedAt: t.deletedAt ?? new Date() })),
    ...leaves.map((l) => ({
      kind: "leave" as const,
      id: l.id,
      label: `${format(l.startDate, "MMM d")} – ${format(l.endDate, "MMM d, yyyy")}`,
      deletedAt: l.deletedAt ?? new Date(),
    })),
    ...projects.map((p) => ({ kind: "project" as const, id: p.id, label: p.name, deletedAt: p.deletedAt ?? new Date() })),
    ...packages.map((p) => ({ kind: "package" as const, id: p.id, label: p.name, deletedAt: p.deletedAt ?? new Date() })),
    ...profiles.map((p) => ({ kind: "profile" as const, id: p.id, label: p.label, deletedAt: p.deletedAt ?? new Date() })),
    ...files.map((f) => ({ kind: "file" as const, id: f.id, label: f.name, deletedAt: f.deletedAt ?? new Date() })),
  ];

  return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}
