import type { Package } from "@prisma/client";
import { parseTags, type PackageLanguage, type PackageStatus } from "@/types";

// Legacy stored registry keys → pretty labels; free-text registries show as typed.
const LEGACY_REGISTRY_LABEL: Record<string, string> = { npm: "npm", pubdev: "pub.dev" };

export function registryLabel(registry: string): string {
  return LEGACY_REGISTRY_LABEL[registry] ?? registry;
}

// Which built-in live-stats provider (if any) backs this registry name. npm & pub.dev
// have free public APIs; everything else is tracked manually. Case/punctuation-insensitive
// so "pub.dev", "pubdev", "PyPI" etc. normalise consistently.
export function registryProvider(registry: string): "npm" | "pubdev" | null {
  const key = registry.toLowerCase().replace(/[^a-z]/g, "");
  if (key === "npm") return "npm";
  if (key === "pubdev") return "pubdev";
  return null;
}

export interface PackageView {
  id: string;
  name: string;
  description: string | null;
  registry: string;
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
  vulnerable: boolean;
  advisoryUrl: string | null;
  lastSyncedAt: Date | null;
  displayVersion: string;
  hasUpdate: boolean;
}

export function toPackageView(row: Package): PackageView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    registry: row.registry,
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
    vulnerable: row.vulnerable,
    advisoryUrl: row.advisoryUrl,
    lastSyncedAt: row.lastSyncedAt,
    displayVersion: row.latestVersion ?? row.currentVersion ?? "—",
    hasUpdate: Boolean(row.latestVersion && row.currentVersion && row.latestVersion !== row.currentVersion),
  };
}
