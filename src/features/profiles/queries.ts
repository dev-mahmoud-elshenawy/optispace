import "server-only";

import { db } from "@/lib/db";
import { toProfileView, type ProfileView } from "@/features/profiles/service";

export async function listProfiles(): Promise<ProfileView[]> {
  const rows = await db.profile.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toProfileView);
}
