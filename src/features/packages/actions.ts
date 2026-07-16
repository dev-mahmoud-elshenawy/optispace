"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { serializeTags, type PackageRegistry } from "@/types";
import { packageSchema, type PackageInput } from "./schema";
import { checkVulnerabilities, fetchRegistryStats } from "./registry";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidatePackages(): void {
  revalidatePath("/packages");
}

function firstError(issues: { message: string }[], fallback: string): string {
  return issues[0]?.message ?? fallback;
}

function toWriteData(input: PackageInput) {
  return {
    name: input.name,
    description: input.description || null,
    registry: input.registry,
    registryUrl: input.registryUrl || null,
    githubUrl: input.githubUrl || null,
    language: input.language,
    currentVersion: input.currentVersion || null,
    tags: serializeTags(input.tags),
    status: input.status,
    projectId: input.projectId || null,
  };
}

export async function createPackage(input: PackageInput): Promise<ActionResult> {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error.issues, "Invalid package") };
  }

  try {
    await db.package.create({ data: toWriteData(parsed.data) });
    revalidatePackages();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to create package." };
  }
}

export async function updatePackage(id: string, input: PackageInput): Promise<ActionResult> {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error.issues, "Invalid package") };
  }

  try {
    await db.package.update({ where: { id }, data: toWriteData(parsed.data) });
    revalidatePackages();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update package." };
  }
}

export async function deletePackage(id: string): Promise<ActionResult> {
  try {
    await db.package.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePackages();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to delete package." };
  }
}

export async function refreshPackageStats(id: string): Promise<ActionResult> {
  const pkg = await db.package.findFirst({ where: { id, deletedAt: null } });
  if (!pkg) {
    return { ok: false, error: "Package not found." };
  }

  try {
    const registry = pkg.registry as PackageRegistry;
    const [stats, vuln] = await Promise.all([
      fetchRegistryStats({ registry, name: pkg.name }),
      checkVulnerabilities({ registry, name: pkg.name }, pkg.currentVersion),
    ]);
    await db.package.update({
      where: { id },
      data: {
        latestVersion: stats.latestVersion ?? pkg.latestVersion,
        weeklyDownloads: stats.weeklyDownloads ?? pkg.weeklyDownloads,
        likes: stats.likes ?? pkg.likes,
        pubPoints: stats.pubPoints ?? pkg.pubPoints,
        vulnerable: vuln.vulnerable,
        advisoryUrl: vuln.advisoryUrl,
        lastSyncedAt: new Date(),
      },
    });
    revalidatePackages();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to refresh stats." };
  }
}

const STALE_HOURS = 24;

// Called from the background poller — refreshes only packages not synced in the
// last 24h, so stats/vulnerability status stay current without a manual click.
// Self-throttling: once refreshed, lastSyncedAt keeps a package out of the stale
// set for another 24h, so this is safe to call on every 2-minute poll tick.
export async function refreshStalePackageStats(): Promise<{ ok: true; refreshed: number }> {
  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
  const stale = await db.package.findMany({
    where: { deletedAt: null, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }] },
    select: { id: true },
  });
  let refreshed = 0;
  for (const pkg of stale) {
    const result = await refreshPackageStats(pkg.id);
    if (result.ok) refreshed += 1;
  }
  return { ok: true, refreshed };
}

// ponytail: sequential + reuses refreshPackageStats (one extra findUnique per item) — fine at
// personal-app scale (dozens of packages, not thousands). Chunk/parallelize if that ever changes.
export async function refreshAllStats(): Promise<ActionResult> {
  const packages = await db.package.findMany({ where: { deletedAt: null }, select: { id: true } });
  let failures = 0;

  for (const pkg of packages) {
    const result = await refreshPackageStats(pkg.id);
    if (!result.ok) failures += 1;
  }

  if (failures === 0) return { ok: true };
  if (failures === packages.length) {
    return { ok: false, error: `Failed to refresh all ${failures} package(s).` };
  }
  return { ok: false, error: `Refreshed with ${failures} failure(s) out of ${packages.length}.` };
}
