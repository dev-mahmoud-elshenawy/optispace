"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { AlertTriangle, ArrowUpRight, Bug, Clock } from "lucide-react";

import { avatarColor } from "@/lib/avatar";

import { formatDays, initials } from "../service";
import { AGING_DAYS, type TeamAverages, type TeamMemberStats } from "../types";

// One person at a glance: ranked by delivery, a throughput sparkline, and only the chips that carry
// a signal (bug-heavy, slower than the team, untouched work). Everything deeper is one click away.
export function MemberCard({
  member,
  rank,
  team,
  weekly,
  closedShare,
  onOpen,
}: {
  member: TeamMemberStats;
  rank: number;
  team: TeamAverages;
  weekly: { label: string; count: number }[];
  closedShare: number;
  onOpen: () => void;
}) {
  const bugHeavy = member.total >= 5 && member.bugRatio >= Math.max(team.bugRatio * 1.5, 0.25);
  const slow =
    member.medianWorkDays !== null &&
    team.medianWorkDays !== null &&
    member.medianWorkDays > team.medianWorkDays * 1.5;
  const ahead = team.closedPerMember > 0 && member.closed >= team.closedPerMember * 1.5;
  const hasTrend = weekly.some((w) => w.count > 0);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group relative flex w-full flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/60 p-4 text-left backdrop-blur transition-colors hover:border-primary/40 hover:bg-accent/30"
      >
        {/* Delivery share as a hairline along the top — ranking you can read without numbers. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-cyan-400"
          style={{ width: `${Math.max(closedShare, 0.02) * 100}%` }}
        />

        <div className="flex items-center gap-3">
          <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{rank}</span>
          <span
            className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(member.name)}`}
            title={member.email ?? member.name}
          >
            {initials(member.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{member.name}</span>
            <span className="text-xs text-muted-foreground">
              {member.total} items · {Math.round(member.estimateCoverage * 100)}% estimated
            </span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <div className="flex items-end gap-4">
          <span className="shrink-0">
            <span className="block font-mono text-2xl font-semibold leading-none tabular-nums">{member.closed}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">finished</span>
          </span>
          <span className="shrink-0">
            <span className="block font-mono text-2xl font-semibold leading-none tabular-nums text-primary">
              {member.wip}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">open</span>
          </span>
          {/* Always the SAME measure in this slot. Swapping in lead time when Active dates were
              missing made two cards side by side incomparable — the gap is flagged as a chip instead. */}
          <span className="shrink-0" title="Median time from Active to Closed">
            <span className="block font-mono text-2xl font-semibold leading-none tabular-nums">
              {formatDays(member.medianWorkDays)}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">active work</span>
          </span>
          <span className="ml-auto h-10 w-24 shrink-0">
            {hasTrend ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekly} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
                  <defs>
                    <linearGradient id={`spark-${rank}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--chart-1)"
                    strokeWidth={1.5}
                    fill={`url(#spark-${rank})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <span className="flex h-full items-end justify-end text-[10px] text-muted-foreground">no closes</span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ahead ? <Chip tone="good">Above team average</Chip> : null}
          {bugHeavy ? (
            <Chip tone="watch">
              <Bug className="size-3" /> {Math.round(member.bugRatio * 100)}% bugs
            </Chip>
          ) : null}
          {slow ? (
            <Chip tone="watch">
              <Clock className="size-3" /> slower than team
            </Chip>
          ) : null}
          {member.aging > 0 ? (
            <Chip tone={member.aging >= 5 ? "risk" : "watch"}>
              <AlertTriangle className="size-3" /> {member.aging} untouched {AGING_DAYS}d+
            </Chip>
          ) : null}
          {member.closed === 0 && member.wip > 0 ? <Chip tone="risk">Nothing finished</Chip> : null}
          {member.closed > 0 && member.medianWorkDays === null ? (
            <Chip tone="watch">
              <Clock className="size-3" /> no Active dates · lead {formatDays(member.medianLeadDays)}
            </Chip>
          ) : null}
        </div>
      </button>
    </li>
  );
}

const CHIP_TONE = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  watch: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  risk: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

function Chip({ tone, children }: { tone: keyof typeof CHIP_TONE; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}
