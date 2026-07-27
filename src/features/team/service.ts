// Pure aggregation over the live ADO read — no DB, no `server-only`, so the client view can
// re-roll locally when filters change without another round trip.
import { AGING_DAYS, UNASSIGNED, type TeamMemberStats, type TeamRollup, type TeamWorkItem } from "./types";

const DAY_MS = 86_400_000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function cycleDays(item: TeamWorkItem): number | null {
  if (!item.closedDate) return null;
  const days = (new Date(item.closedDate).getTime() - new Date(item.createdDate).getTime()) / DAY_MS;
  return Number.isFinite(days) && days >= 0 ? days : null;
}

// One pass per member: WIP now, closed inside the window, bug share, median cycle time and
// aging (open + untouched). `now` is passed in so the caller controls it — computing it here
// would make the numbers differ between the server render and a client re-roll.
export function rollupTeam(items: TeamWorkItem[], now: Date): TeamRollup {
  const agingBefore = now.getTime() - AGING_DAYS * DAY_MS;
  const byMember = new Map<string, TeamWorkItem[]>();
  for (const item of items) {
    const key = item.assignedTo || UNASSIGNED;
    const list = byMember.get(key);
    if (list) {
      list.push(item);
    } else {
      byMember.set(key, [item]);
    }
  }

  const members: TeamMemberStats[] = [...byMember].map(([name, own]) => {
    const open = own.filter((i) => i.status !== "done");
    const closed = own.filter((i) => i.status === "done");
    const bugs = own.filter((i) => i.type.toLowerCase() === "bug").length;
    return {
      name,
      email: own.find((i) => i.assignedToEmail)?.assignedToEmail ?? null,
      wip: open.length,
      inProgress: open.filter((i) => i.status === "in_progress").length,
      closed: closed.length,
      bugs,
      bugRatio: own.length > 0 ? bugs / own.length : 0,
      medianCycleDays: median(closed.map(cycleDays).filter((d): d is number => d !== null)),
      aging: open.filter((i) => (i.changedDate ? new Date(i.changedDate).getTime() < agingBefore : false)).length,
      total: own.length,
    };
  });

  // Closed desc is the evaluation-report order; ties fall back to WIP then name.
  members.sort((a, b) => b.closed - a.closed || b.wip - a.wip || a.name.localeCompare(b.name));

  const bugs = items.filter((i) => i.type.toLowerCase() === "bug").length;
  return {
    members,
    closed: items.filter((i) => i.status === "done").length,
    wip: items.filter((i) => i.status !== "done").length,
    bugRatio: items.length > 0 ? bugs / items.length : 0,
    medianCycleDays: median(items.map(cycleDays).filter((d): d is number => d !== null)),
    unassigned: byMember.get(UNASSIGNED)?.length ?? 0,
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function formatDays(days: number | null): string {
  if (days === null) return "—";
  return days >= 10 ? `${Math.round(days)}d` : `${days.toFixed(1)}d`;
}

// Short label for an iteration path: "Fit on Call\Sprint 6" → "Sprint 6".
export function iterationLabel(path: string): string {
  const parts = path.split("\\");
  return parts[parts.length - 1] || path;
}
