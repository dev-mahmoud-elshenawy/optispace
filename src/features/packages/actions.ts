"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { serializeTags, type PackageRegistry } from "@/types";
import { packageSchema, type PackageInput } from "./schema";
import { fetchRegistryStats } from "./registry";

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
    await db.package.delete({ where: { id } });
    revalidatePackages();
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to delete package." };
  }
}

export async function refreshPackageStats(id: string): Promise<ActionResult> {
  const pkg = await db.package.findUnique({ where: { id } });
  if (!pkg) {
    return { ok: false, error: "Package not found." };
  }

  try {
    const stats = await fetchRegistryStats({ registry: pkg.registry as PackageRegistry, name: pkg.name });
    await db.package.update({
      where: { id },
      data: {
        latestVersion: stats.latestVersion ?? pkg.latestVersion,
        weeklyDownloads: stats.weeklyDownloads ?? pkg.weeklyDownloads,
        likes: stats.likes ?? pkg.likes,
        pubPoints: stats.pubPoints ?? pkg.pubPoints,
        lastSyncedAt: new Date(),
      },
    });
    revalidatePackages();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to refresh stats." };
  }
}

// ponytail: sequential + reuses refreshPackageStats (one extra findUnique per item) — fine at
// personal-app scale (dozens of packages, not thousands). Chunk/parallelize if that ever changes.
export async function refreshAllStats(): Promise<ActionResult> {
  const packages = await db.package.findMany({ select: { id: true } });
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
