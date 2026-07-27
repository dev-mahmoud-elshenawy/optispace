// Pure aggregation over the live ADO read — no DB, no `server-only`, so the client view can
// re-roll locally when filters change without another round trip.
import {
  AGING_DAYS,
  FAST_CLOSE_DAYS,
  UNASSIGNED,
  WEEKS_SHOWN,
  type Insight,
  type MemberDetail,
  type TeamAverages,
  type TeamMemberStats,
  type TeamRollup,
  type TeamWorkItem,
} from "./types";

const DAY_MS = 86_400_000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0);
}

// Median of logged ÷ planned, over items that have BOTH. 1.0 = estimated exactly; 2.0 = took twice
// the estimate. Returns null when Completed Work is never filled in — which is the case in this
// org today, so the UI must say "not tracked" rather than print a made-up ratio.
export function estimateAccuracy(items: TeamWorkItem[]): number | null {
  const ratios = items
    .filter((i) => (i.originalEstimate ?? 0) > 0 && (i.completedWork ?? 0) > 0)
    .map((i) => (i.completedWork as number) / (i.originalEstimate as number));
  return median(ratios);
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
    const estimated = own.filter((i) => (i.originalEstimate ?? 0) > 0);
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
      estimated: estimated.length,
      estimateCoverage: own.length > 0 ? estimated.length / own.length : 0,
      plannedHours: sum(own.map((i) => i.originalEstimate)),
      loggedHours: sum(own.map((i) => i.completedWork)),
      accuracy: estimateAccuracy(own),
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
    estimateCoverage: items.length > 0 ? items.filter((i) => (i.originalEstimate ?? 0) > 0).length / items.length : 0,
    plannedHours: sum(items.map((i) => i.originalEstimate)),
    loggedHours: sum(items.map((i) => i.completedWork)),
  };
}

const CYCLE_BUCKETS: { label: string; max: number }[] = [
  { label: "< 1d", max: 1 },
  { label: "1–3d", max: 3 },
  { label: "3–7d", max: 7 },
  { label: "1–2w", max: 14 },
  { label: "2–4w", max: 30 },
  { label: "> 4w", max: Infinity },
];

function tally(labels: string[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

// Everything the drill-down shows for one person, derived from the same already-fetched items.
export function memberDetail(items: TeamWorkItem[], now: Date): MemberDetail {
  const closed = items.filter((i) => i.status === "done" && i.closedDate);
  const open = items.filter((i) => i.status !== "done");
  const cycles = closed.map(cycleDays).filter((d): d is number => d !== null);

  const monthKey = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  const monthOrder = [...new Set(closed.map((i) => new Date(i.closedDate as string).getTime()))].sort((a, b) => a - b);
  const monthLabels = [...new Set(monthOrder.map((t) => monthKey(new Date(t).toISOString())))];
  const closedPerMonth = new Map<string, number>();
  for (const i of closed) {
    const key = monthKey(i.closedDate as string);
    closedPerMonth.set(key, (closedPerMonth.get(key) ?? 0) + 1);
  }

  return {
    weekly: weeklyThroughput(items, now),
    p85CycleDays: percentile(cycles, 0.85),
    fastCloseRate: cycles.length > 0 ? cycles.filter((d) => d < FAST_CLOSE_DAYS).length / cycles.length : 0,
    // Chronological, not count-sorted — a trend only reads left-to-right.
    closedByMonth: monthLabels.map((label) => ({ label, count: closedPerMonth.get(label) ?? 0 })),
    closedBySprint: tally(closed.map((i) => (i.iterationPath ? iterationLabel(i.iterationPath) : "No sprint"))),
    cycleBuckets: CYCLE_BUCKETS.map(({ label, max }, index) => ({
      label,
      count: cycles.filter((d) => d < max && (index === 0 || d >= CYCLE_BUCKETS[index - 1].max)).length,
    })),
    typeMix: tally(items.map((i) => i.type || "Unknown")),
    byType: [...new Set(items.map((i) => i.type || "Unknown"))]
      .map((label) => {
        const own = items.filter((i) => (i.type || "Unknown") === label);
        const ownClosed = own.filter((i) => i.status === "done");
        return {
          label,
          count: own.length,
          closed: ownClosed.length,
          medianDays: median(ownClosed.map(cycleDays).filter((d): d is number => d !== null)),
          plannedHours: sum(own.map((i) => i.originalEstimate)),
        };
      })
      .sort((a, b) => b.count - a.count),
    openByState: tally(open.map((i) => i.state || "Unknown")),
    fastestDays: cycles.length > 0 ? Math.min(...cycles) : null,
    slowestDays: cycles.length > 0 ? Math.max(...cycles) : null,
    oldestOpenDays:
      open.length > 0
        ? Math.max(
            ...open.map((i) => (now.getTime() - new Date(i.changedDate ?? i.createdDate).getTime()) / DAY_MS),
          )
        : null,
  };
}

// The value below which `p` of the samples fall — p85 answers "how bad does it realistically get",
// which a median deliberately hides. Nearest-rank, no interpolation: with 3 samples an interpolated
// p85 would invent a value that never happened.
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

// Finished per week, oldest → newest, with empty weeks kept: a gap IS the signal.
function weeklyThroughput(items: TeamWorkItem[], now: Date): { label: string; count: number }[] {
  const weekMs = 7 * DAY_MS;
  const closed = items.filter((i) => i.status === "done" && i.closedDate);
  return Array.from({ length: WEEKS_SHOWN }, (_, index) => {
    const end = now.getTime() - index * weekMs;
    const start = end - weekMs;
    const count = closed.filter((i) => {
      const t = new Date(i.closedDate as string).getTime();
      return t > start && t <= end;
    }).length;
    return { label: index === 0 ? "This wk" : `-${index}w`, count };
  }).reverse();
}

export function teamAverages(members: TeamMemberStats[]): TeamAverages {
  const real = members.filter((m) => m.name !== UNASSIGNED);
  const cycles = real.map((m) => m.medianCycleDays).filter((d): d is number => d !== null);
  return {
    bugRatio: real.length > 0 ? real.reduce((s, m) => s + m.bugRatio, 0) / real.length : 0,
    medianCycleDays: median(cycles),
    estimateCoverage: real.length > 0 ? real.reduce((s, m) => s + m.estimateCoverage, 0) / real.length : 0,
    closedPerMember: real.length > 0 ? real.reduce((s, m) => s + m.closed, 0) / real.length : 0,
  };
}

// Plain-English, comparative observations for a review conversation. Only claims things the data
// actually supports — each one is gated on having enough samples to mean anything.
export function memberInsights(
  member: TeamMemberStats,
  detail: MemberDetail,
  team: TeamAverages,
): Insight[] {
  const out: Insight[] = [];

  if (member.closed >= 3 && detail.fastCloseRate >= 0.5) {
    out.push({
      tone: "good",
      text: `Turns work around fast — ${Math.round(detail.fastCloseRate * 100)}% of finished items closed in under ${FAST_CLOSE_DAYS} days.`,
    });
  }
  if (member.closed > 0 && team.closedPerMember > 0 && member.closed >= team.closedPerMember * 1.5) {
    out.push({
      tone: "good",
      text: `Finished ${member.closed} items — well above the team average of ${team.closedPerMember.toFixed(1)}.`,
    });
  }
  if (member.closed > 0 && team.closedPerMember >= 2 && member.closed <= team.closedPerMember * 0.5) {
    out.push({
      tone: "watch",
      text: `Finished ${member.closed} items against a team average of ${team.closedPerMember.toFixed(1)} — worth understanding what absorbed the time.`,
    });
  }
  if (member.medianCycleDays !== null && detail.p85CycleDays !== null && detail.p85CycleDays > member.medianCycleDays * 4) {
    out.push({
      tone: "watch",
      text: `Inconsistent turnaround: typically ${formatDays(member.medianCycleDays)}, but the slow tail reaches ${formatDays(detail.p85CycleDays)}.`,
    });
  }
  if (member.total >= 5 && team.bugRatio > 0 && member.bugRatio >= Math.max(team.bugRatio * 1.5, 0.25)) {
    out.push({
      tone: "watch",
      text: `Bug-heavy load — ${Math.round(member.bugRatio * 100)}% bugs vs ${Math.round(team.bugRatio * 100)}% across the team; less room for feature work.`,
    });
  }
  if (member.aging > 0) {
    out.push({
      tone: member.aging >= 5 ? "risk" : "watch",
      text: `${member.aging} open item${member.aging === 1 ? "" : "s"} with no update for ${AGING_DAYS}+ days${
        detail.oldestOpenDays !== null ? ` — oldest ${formatDays(detail.oldestOpenDays)}` : ""
      }.`,
    });
  }
  if (member.wip >= 10) {
    out.push({
      tone: "risk",
      text: `${member.wip} items open at once — spread thin, and nothing here shows what is actually being worked on.`,
    });
  }
  if (member.total >= 5 && member.estimateCoverage < 0.5) {
    out.push({
      tone: "watch",
      // Only cite the team figure when there IS one — "team 0%" next to "0%" says nothing.
      text: `Only ${Math.round(member.estimateCoverage * 100)}% of their work carries an estimate${
        team.estimateCoverage > 0 ? ` (team ${Math.round(team.estimateCoverage * 100)}%)` : " — nobody on this project estimates"
      } — planning is guesswork.`,
    });
  }
  if (member.closed === 0 && member.wip > 0) {
    out.push({ tone: "risk", text: "Nothing finished in this window — everything is still open." });
  }
  if (out.length === 0) {
    out.push({ tone: "good", text: "Nothing stands out either way in this window." });
  }
  return out;
}

// A paste-ready Markdown block for the actual evaluation document. Numbers plus the caveats that
// keep them honest — a report that hides its own limits is worse than no report.
export function memberReportMarkdown(input: {
  member: TeamMemberStats;
  detail: MemberDetail;
  insights: Insight[];
  team: TeamAverages;
  project: string;
  sprint: string;
  windowDays: number;
}): string {
  const { member, detail, insights, team, project, sprint, windowDays } = input;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const lines = [
    `# ${member.name}`,
    ``,
    `**Project:** ${project} · **Sprint:** ${sprint} · **Window:** last ${windowDays} days`,
    ``,
    `| Measure | Them | Team |`,
    `| --- | --- | --- |`,
    `| Finished | ${member.closed} | ${team.closedPerMember.toFixed(1)} avg |`,
    `| Open now | ${member.wip} (${member.inProgress} in progress) | — |`,
    `| Typical time to finish | ${formatDays(member.medianCycleDays)} | ${formatDays(team.medianCycleDays)} |`,
    `| Slow tail (p85) | ${formatDays(detail.p85CycleDays)} | — |`,
    `| Bug share | ${pct(member.bugRatio)} | ${pct(team.bugRatio)} |`,
    `| Untouched ${AGING_DAYS}d+ | ${member.aging} | — |`,
    `| Estimate coverage | ${pct(member.estimateCoverage)} | ${pct(team.estimateCoverage)} |`,
    ``,
    `## Observations`,
    ...insights.map((i) => `- ${i.tone === "good" ? "✅" : i.tone === "watch" ? "⚠️" : "🔴"} ${i.text}`),
    ``,
    `## Work breakdown`,
    ``,
    `| Type | Items | Finished | Usual time | Planned hrs |`,
    `| --- | --- | --- | --- | --- |`,
    ...detail.byType.map(
      (t) => `| ${t.label} | ${t.count} | ${t.closed} | ${formatDays(t.medianDays)} | ${t.plannedHours || "—"} |`,
    ),
    ``,
    `## Caveats`,
    `- Estimate vs actual is unavailable: Completed Work is not filled in, so only planned hours exist.`,
    `- A bulk close in Azure DevOps (many items closed at one timestamp) inflates time-to-finish.`,
    `- Counts cover Tasks and Bugs; user stories are containers and are excluded.`,
  ];
  return lines.join("\n");
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
