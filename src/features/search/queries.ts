import "server-only";

import { db } from "@/lib/db";

import type { SearchItem } from "./types";

// Lightweight index for the ⌘K palette — titles/names only, matched client-side.
export async function getSearchIndex(): Promise<SearchItem[]> {
  const [tasks, projects, packages, profiles] = await Promise.all([
    db.task.findMany({ where: { deletedAt: null }, select: { title: true }, orderBy: { updatedAt: "desc" } }),
    db.project.findMany({ where: { deletedAt: null }, select: { name: true }, orderBy: { name: "asc" } }),
    db.package.findMany({ where: { deletedAt: null }, select: { name: true }, orderBy: { name: "asc" } }),
    db.profile.findMany({ where: { deletedAt: null }, select: { label: true }, orderBy: { order: "asc" } }),
  ]);

  return [
    ...tasks.map((t) => ({ type: "Task" as const, label: t.title, href: "/tasks" })),
    ...projects.map((p) => ({ type: "Project" as const, label: p.name, href: "/projects" })),
    ...packages.map((p) => ({ type: "Package" as const, label: p.name, href: "/packages" })),
    ...profiles.map((p) => ({ type: "Profile" as const, label: p.label, href: "/profiles" })),
  ];
}
