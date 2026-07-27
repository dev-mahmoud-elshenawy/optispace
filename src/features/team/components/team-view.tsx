"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { avatarColor } from "@/lib/avatar";
import { persistentCache } from "@/lib/lru";
import { getAzureDevOpsIterations } from "@/features/integrations/azure-devops/actions";
import { AzureDevOpsTaskDetail } from "@/features/integrations/azure-devops/task-detail";
import { workItemStateColor, workItemTypeColor } from "@/features/integrations/azure-devops/types";

import { loadTeamWork } from "../actions";
import { formatDays, initials, iterationLabel, rollupTeam } from "../service";
import { AGING_DAYS, TEAM_WINDOWS, UNASSIGNED, type TeamWindow, type TeamWorkItem } from "../types";

// Same stale-while-revalidate pattern as the PR/work-item modals: a repeat query paints from
// the saved copy instantly, then refreshes in the background.
const workCache = persistentCache<{ items: TeamWorkItem[]; truncated: boolean }>("team-work", { max: 12 });
const ALL = "all";

interface TeamViewProps {
  projects: string[];
  defaultProject: string;
}

export function TeamView({ projects, defaultProject }: TeamViewProps) {
  const [project, setProject] = useState(defaultProject);
  const [iterations, setIterations] = useState<string[]>([]);
  const [iteration, setIteration] = useState(ALL);
  const [windowDays, setWindowDays] = useState<TeamWindow>(90);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<TeamWorkItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  // Fixed at load time so the aging/cycle numbers don't drift while you read the table.
  const [asOf, setAsOf] = useState<Date | null>(null);

  const cacheKey = `${project}|${iteration}|${windowDays}`;

  const load = useCallback(async () => {
    if (!project) return;
    const cached = workCache.get(cacheKey);
    if (cached) {
      setItems(cached.items);
      setTruncated(cached.truncated);
      setAsOf(new Date());
    }
    setLoading(!cached);
    setError(null);
    const result = await loadTeamWork({
      project,
      iterationPath: iteration === ALL ? null : iteration,
      windowDays,
    });
    setLoading(false);
    if (result.ok) {
      workCache.set(cacheKey, { items: result.items, truncated: result.truncated });
      setItems(result.items);
      setTruncated(result.truncated);
      setAsOf(new Date());
    } else if (!cached) {
      setError(result.error);
      setItems([]);
    }
  }, [project, iteration, windowDays, cacheKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    setIteration(ALL); // a sprint from the previous project is meaningless here
    getAzureDevOpsIterations(project)
      .then((paths) => {
        if (!cancelled) setIterations(paths);
      })
      .catch(() => {
        if (!cancelled) setIterations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.title.toLowerCase().includes(q) || i.assignedTo.toLowerCase().includes(q));
  }, [items, search]);

  const rollup = useMemo(() => rollupTeam(visible, asOf ?? new Date()), [visible, asOf]);
  const maxClosed = Math.max(1, ...rollup.members.map((m) => m.closed));
  const maxWip = Math.max(1, ...rollup.members.map((m) => m.wip));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={iteration} onValueChange={setIteration}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All sprints" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sprints</SelectItem>
            {iterations.map((it) => (
              <SelectItem key={it} value={it}>
                {iterationLabel(it)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v) as TeamWindow)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEAM_WINDOWS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                Last {d} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or person…"
          className="w-56"
        />

        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
        </Button>
        {loading ? <span className="text-xs text-muted-foreground">Reading Azure DevOps…</span> : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {truncated ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          Hit the item cap for this window — narrow the sprint or shorten the range for exact totals.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryTile label="Closed" value={String(rollup.closed)} hint={`last ${windowDays} days`} />
        <SummaryTile label="In flight" value={String(rollup.wip)} hint="open right now" />
        <SummaryTile label="Bug share" value={`${Math.round(rollup.bugRatio * 100)}%`} hint="of items touched" />
        <SummaryTile label="Median cycle" value={formatDays(rollup.medianCycleDays)} hint="created → closed" />
        <SummaryTile label="Unassigned" value={String(rollup.unassigned)} hint="no assignee" />
      </div>

      <Card>
        <CardContent className="pt-6">
          {rollup.members.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" /> {loading ? "Loading…" : "No work items in this window."}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {rollup.members.map((m) => {
                const isOpen = expanded === m.name;
                return (
                  <li key={m.name}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : m.name)}
                      className="flex w-full items-center gap-3 py-3 text-left hover:bg-accent/40"
                    >
                      <ChevronRight
                        className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      <span
                        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarColor(m.name)}`}
                        title={m.email ?? m.name}
                      >
                        {initials(m.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {m.total} items · {Math.round(m.bugRatio * 100)}% bugs
                          {m.aging > 0 ? ` · ${m.aging} aging` : ""}
                        </span>
                      </span>
                      <Metric label="closed" value={m.closed} bar={m.closed / maxClosed} tone="bg-emerald-500" />
                      <Metric label="in flight" value={m.wip} bar={m.wip / maxWip} tone="bg-primary" />
                      <span className="w-16 shrink-0 text-right">
                        <span className="block font-mono text-sm tabular-nums">{formatDays(m.medianCycleDays)}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">cycle</span>
                      </span>
                    </button>

                    {isOpen ? (
                      <ul className="mb-3 space-y-1 pl-11">
                        {visible
                          .filter((i) => (i.assignedTo || UNASSIGNED) === m.name)
                          .sort((a, b) => (b.changedDate ?? "").localeCompare(a.changedDate ?? ""))
                          .map((i) => (
                            <li key={i.externalId}>
                              <button
                                type="button"
                                onClick={() => setOpenItem(i.externalId)}
                                className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-left text-sm hover:bg-accent/60"
                              >
                                <span
                                  className="size-2.5 shrink-0 rounded-[3px]"
                                  style={{ backgroundColor: workItemTypeColor(i.type) }}
                                  title={i.type}
                                />
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">#{i.externalId}</span>
                                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                                {i.iterationPath ? (
                                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                                    {iterationLabel(i.iterationPath)}
                                  </span>
                                ) : null}
                                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                  <span
                                    className="size-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: workItemStateColor(i.state) }}
                                  />
                                  {i.state}
                                </span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Aging = open and untouched for {AGING_DAYS}+ days. Read live from Azure DevOps — nothing is stored locally.
          </p>
        </CardContent>
      </Card>

      {openItem ? (
        <AzureDevOpsTaskDetail
          externalId={openItem}
          open={openItem !== null}
          onOpenChange={(next) => {
            if (!next) setOpenItem(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, bar, tone }: { label: string; value: number; bar: number; tone: string }) {
  return (
    <span className="hidden w-28 shrink-0 sm:block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm tabular-nums">{value}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </span>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(bar, 0) * 100}%` }} />
      </span>
    </span>
  );
}
