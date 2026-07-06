// Pure registry API client — no db, no Next.js imports. Called only from actions.ts,
// and only on explicit user action (never on page load).
import type { PackageRegistry } from "@/types";

export interface RegistryStats {
  latestVersion?: string;
  weeklyDownloads?: number;
  likes?: number;
  pubPoints?: number;
}

interface FetchRegistryStatsInput {
  registry: PackageRegistry;
  name: string;
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    return res.ok ? ((await res.json()) as unknown) : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

async function fetchNpmStats(name: string): Promise<RegistryStats> {
  const encoded = encodeURIComponent(name);
  const [pkg, downloads] = await Promise.all([
    fetchJson(`https://registry.npmjs.org/${encoded}`),
    fetchJson(`https://api.npmjs.org/downloads/point/last-week/${encoded}`),
  ]);
  if (pkg === null && downloads === null) {
    throw new Error(`Could not reach the npm registry for "${name}".`);
  }

  const stats: RegistryStats = {};
  const distTags = asRecord(asRecord(pkg)?.["dist-tags"]);
  if (typeof distTags?.latest === "string") stats.latestVersion = distTags.latest;
  const downloadCount = asRecord(downloads)?.downloads;
  if (typeof downloadCount === "number") stats.weeklyDownloads = downloadCount;
  return stats;
}

async function fetchPubDevStats(name: string): Promise<RegistryStats> {
  const encoded = encodeURIComponent(name);
  const [pkg, score] = await Promise.all([
    fetchJson(`https://pub.dev/api/packages/${encoded}`),
    fetchJson(`https://pub.dev/api/packages/${encoded}/score`),
  ]);
  if (pkg === null && score === null) {
    throw new Error(`Could not reach pub.dev for "${name}".`);
  }

  const stats: RegistryStats = {};
  const latest = asRecord(asRecord(pkg)?.latest);
  if (typeof latest?.version === "string") stats.latestVersion = latest.version;
  const scoreRecord = asRecord(score);
  if (typeof scoreRecord?.likeCount === "number") stats.likes = scoreRecord.likeCount;
  if (typeof scoreRecord?.grantedPoints === "number") stats.pubPoints = scoreRecord.grantedPoints;
  return stats;
}

export async function fetchRegistryStats(input: FetchRegistryStatsInput): Promise<RegistryStats> {
  return input.registry === "npm" ? fetchNpmStats(input.name) : fetchPubDevStats(input.name);
}
