import type { Package } from "@prisma/client";
import { parseTags, type PackageRegistry, type PackageLanguage, type PackageStatus } from "@/types";

export interface PackageView {
  id: string;
  name: string;
  description: string | null;
  registry: PackageRegistry;
  registryUrl: string | null;
  githubUrl: string | null;
  language: PackageLanguage;
  currentVersion: string | null;
  tags: string[];
  status: PackageStatus;
  projectId: string | null;
  latestVersion: string | null;
  weeklyDownloads: number | null;
  likes: number | null;
  pubPoints: number | null;
  lastSyncedAt: Date | null;
  displayVersion: string;
  hasUpdate: boolean;
}

export function toPackageView(row: Package): PackageView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    registry: row.registry as PackageRegistry,
    registryUrl: row.registryUrl,
    githubUrl: row.githubUrl,
    language: row.language as PackageLanguage,
    currentVersion: row.currentVersion,
    tags: parseTags(row.tags),
    status: row.status as PackageStatus,
    projectId: row.projectId,
    latestVersion: row.latestVersion,
    weeklyDownloads: row.weeklyDownloads,
    likes: row.likes,
    pubPoints: row.pubPoints,
    lastSyncedAt: row.lastSyncedAt,
    displayVersion: row.latestVersion ?? row.currentVersion ?? "—",
    hasUpdate: Boolean(row.latestVersion && row.currentVersion && row.latestVersion !== row.currentVersion),
  };
}
