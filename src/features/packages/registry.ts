// Pure registry API client — no db, no Next.js imports. Called only from actions.ts,
// and only on explicit user action (never on page load).
import { registryProvider } from "./service";

export interface RegistryStats {
  latestVersion?: string;
  weeklyDownloads?: number;
  likes?: number;
  pubPoints?: number;
}

interface FetchRegistryStatsInput {
  registry: string;
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
  const provider = registryProvider(input.registry);
  if (provider === "npm") return fetchNpmStats(input.name);
  if (provider === "pubdev") return fetchPubDevStats(input.name);
  // Custom registry — no live-stats API wired; tracked manually.
  return {};
}

export interface VersionHistoryEntry {
  version: string;
  published: string | null; // ISO date, or null when the registry doesn't report it
}

const MAX_VERSIONS = 40; // newest N — enough for a changelog view without huge payloads

async function fetchNpmVersions(name: string): Promise<VersionHistoryEntry[]> {
  const pkg = asRecord(await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`));
  const versions = asRecord(pkg?.versions);
  const time = asRecord(pkg?.time);
  if (!versions) return [];
  return Object.keys(versions)
    .map((version) => ({ version, published: typeof time?.[version] === "string" ? (time[version] as string) : null }))
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .slice(0, MAX_VERSIONS);
}

async function fetchPubDevVersions(name: string): Promise<VersionHistoryEntry[]> {
  const pkg = asRecord(await fetchJson(`https://pub.dev/api/packages/${encodeURIComponent(name)}`));
  const list = Array.isArray(pkg?.versions) ? (pkg.versions as unknown[]) : [];
  return list
    .map((v) => asRecord(v))
    .filter((v): v is Record<string, unknown> => v !== null && typeof v.version === "string")
    .map((v) => ({ version: v.version as string, published: typeof v.published === "string" ? v.published : null }))
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .slice(0, MAX_VERSIONS);
}

// Newest-first version history for a package, live from the registry (npm / pub.dev only).
// Custom registries have no wired API → empty list.
export async function fetchVersionHistory(input: FetchRegistryStatsInput): Promise<VersionHistoryEntry[]> {
  const provider = registryProvider(input.registry);
  if (provider === "npm") return fetchNpmVersions(input.name);
  if (provider === "pubdev") return fetchPubDevVersions(input.name);
  return [];
}

export interface VulnerabilityCheck {
  vulnerable: boolean;
  advisoryUrl: string | null;
}

const OSV_ECOSYSTEM: Record<"npm" | "pubdev", string> = { npm: "npm", pubdev: "Pub" };

// OSV.dev — free, no API key, covers the npm and Pub (Dart/Flutter) ecosystems.
// Only meaningful once a version is known, and only for registries with a known OSV
// ecosystem mapping; custom registries skip the check (reported as not vulnerable).
export async function checkVulnerabilities(input: FetchRegistryStatsInput, version: string | null): Promise<VulnerabilityCheck> {
  const provider = registryProvider(input.registry);
  if (!version || provider === null) return { vulnerable: false, advisoryUrl: null };
  try {
    const res = await fetch("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ package: { name: input.name, ecosystem: OSV_ECOSYSTEM[provider] }, version }),
      cache: "no-store",
    });
    if (!res.ok) return { vulnerable: false, advisoryUrl: null };
    const data = asRecord(await res.json());
    const vulns = Array.isArray(data?.vulns) ? (data.vulns as { id?: string }[]) : [];
    if (vulns.length === 0) return { vulnerable: false, advisoryUrl: null };
    const id = vulns[0]?.id;
    return { vulnerable: true, advisoryUrl: id ? `https://osv.dev/vulnerability/${id}` : "https://osv.dev" };
  } catch {
    return { vulnerable: false, advisoryUrl: null };
  }
}
