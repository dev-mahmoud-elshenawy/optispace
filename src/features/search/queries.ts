import "server-only";

import { format } from "date-fns";

import { db } from "@/lib/db";

import type { SearchItem } from "./types";

const RECENT_NOTIFICATIONS_CAP = 50; // avoid indexing the entire notification history

// Lightweight index for the ⌘K palette — titles/names only, matched client-side.
export async function getSearchIndex(): Promise<SearchItem[]> {
  const [tasks, projects, packages, profiles, leaves, notifications, milestones, links, files, prs, feedback] =
    await Promise.all([
      db.task.findMany({ where: { deletedAt: null }, select: { title: true, description: true }, orderBy: { updatedAt: "desc" } }),
      db.project.findMany({ where: { deletedAt: null }, select: { name: true }, orderBy: { name: "asc" } }),
      db.package.findMany({ where: { deletedAt: null }, select: { name: true }, orderBy: { name: "asc" } }),
      db.profile.findMany({ where: { deletedAt: null }, select: { label: true }, orderBy: { order: "asc" } }),
      db.leave.findMany({ where: { deletedAt: null }, select: { startDate: true, endDate: true }, orderBy: { startDate: "desc" } }),
      db.notification.findMany({
        where: { deletedAt: null },
        select: { title: true },
        orderBy: { createdAt: "desc" },
        take: RECENT_NOTIFICATIONS_CAP,
      }),
      db.milestone.findMany({ where: { deletedAt: null }, select: { title: true }, orderBy: { createdAt: "desc" } }),
      db.projectLink.findMany({ where: { deletedAt: null }, select: { label: true }, orderBy: { createdAt: "desc" } }),
      db.projectFile.findMany({ where: { deletedAt: null }, select: { name: true }, orderBy: { createdAt: "desc" } }),
      db.githubPullRequest.findMany({ where: { deletedAt: null }, select: { title: true, repo: true, number: true }, orderBy: { updatedAt: "desc" } }),
      db.projectFeedback.findMany({
        where: { deletedAt: null },
        select: { message: true, from: true, release: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  return [
    ...tasks.map((t) => ({ type: "Task" as const, label: t.title, href: "/tasks", keywords: t.description ?? undefined })),
    ...projects.map((p) => ({ type: "Project" as const, label: p.name, href: "/projects" })),
    ...packages.map((p) => ({ type: "Package" as const, label: p.name, href: "/packages" })),
    ...profiles.map((p) => ({ type: "Profile" as const, label: p.label, href: "/profiles" })),
    ...leaves.map((l) => ({
      type: "Leave" as const,
      label: `${format(l.startDate, "MMM d")}–${format(l.endDate, "MMM d, yyyy")}`,
      href: "/leave",
    })),
    ...notifications.map((n) => ({ type: "Notification" as const, label: n.title, href: "/notifications" })),
    ...milestones.map((m) => ({ type: "Milestone" as const, label: m.title, href: "/projects" })),
    ...links.map((l) => ({ type: "Link" as const, label: l.label, href: "/projects" })),
    ...files.map((f) => ({ type: "File" as const, label: f.name, href: "/projects" })),
    ...prs.map((p) => ({ type: "PullRequest" as const, label: p.title, href: "/pull-requests", keywords: `${p.repo}#${p.number}` })),
    ...feedback.map((f) => ({
      type: "Feedback" as const,
      label: f.message.length > 80 ? `${f.message.slice(0, 80)}…` : f.message,
      href: "/projects",
      keywords: [f.from, f.release].filter(Boolean).join(" ") || undefined,
    })),
  ];
}
