import "server-only";
import { db } from "@/lib/db";
import { toPackageView, type PackageView } from "./service";

export async function listPackages(): Promise<PackageView[]> {
  const rows = await db.package.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  return rows.map(toPackageView);
}

export async function listProjectOptions(): Promise<{ id: string; name: string }[]> {
  return db.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function countPackages(): Promise<number> {
  return db.package.count({ where: { deletedAt: null } });
}
