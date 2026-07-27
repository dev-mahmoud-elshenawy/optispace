"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { persistentCache } from "@/lib/lru";
import { getAzureDevOpsIterations } from "@/features/integrations/azure-devops/actions";

import { loadTeamWork } from "../actions";
import { formatDays, iterationLabel, memberDetail, rollupTeam, teamAverages } from "../service";
import {
  AGING_DAYS,
  DEFAULT_TEAM_WINDOW,
  TEAM_WINDOWS,
  UNASSIGNED,
  isContainerType,
  type TeamMemberStats,
  type TeamWindow,
  type TeamWorkItem,
} from "../types";
import { MemberDetailDialog } from "./member-detail";
import { MemberCard } from "./member-card";

// Same stale-while-revalidate pattern as the PR/work-item modals: a repeat query paints from
// the saved copy instantly, then refreshes in the background.
const workCache = persistentCache<{ items: TeamWorkItem[]; truncated: boolean }>("team-work", { max: 12 });
const ALL = "all"; // explicit "All sprints" choice — a whole-project read
const NONE = ""; // nothing picked yet

interface TeamViewProps {
  projects: string[];
}

// No project is selected on load and nothing is queried until you pick one: a whole-project read
// is expensive, so it must be a deliberate choice rather than something the page does to you.
export function TeamView({ projects }: TeamViewProps) {
  const [project, setProject] = useState("");
  const [iterations, setIterations] = useState<string[]>([]);
  const [iteration, setIteration] = useState(NONE);
  const [windowDays, setWindowDays] = useState<TeamWindow>(DEFAULT_TEAM_WINDOW);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // "work" = Tasks/Bugs only (the default): stories are containers assigned to their owner, so
  // counting them alongside their children double-credits the same work.
  const [scope, setScope] = useState<"work" | "all">("work");
  const [items, setItems] = useState<TeamWorkItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<TeamMemberStats | null>(null);
  // Fixed at load time so the aging/cycle numbers don't drift while you read the table.
  const [asOf, setAsOf] = useState<Date | null>(null);

  // Picking a project deliberately queries NOTHING: the only read that covers a whole project is
  // "All sprints", which is huge. You pick the sprint you want and that triggers the load.
  function pickProject(next: string) {
    setProject(next);
    setIterations([]); // the previous project's sprints don't apply
    setIteration(NONE);
    setItems([]);
    setTruncated(false);
    setError(null);
    setMember(null);
    setPickerOpen(false);
  }

  function pickIteration(next: string) {
    setIteration(next);
    setMember(null);
    void load({ project, iteration: next, windowDays });
  }

  function pickWindow(next: TeamWindow) {
    setWindowDays(next);
    setMember(null);
    if (iteration) void load({ project, iteration, windowDays: next });
  }

  // Loads are triggered by the controls, never by an effect: nothing is queried until you choose a
  // project, and each filter change passes its own values (state wouldn't be updated yet).
  const load = useCallback(async ({ project, iteration, windowDays }: { project: string; iteration: string; windowDays: TeamWindow }) => {
    if (!project) return;
    const cacheKey = `${project}|${iteration}|${windowDays}`;
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
  }, []);

  // Sprints for the picked project. Nothing is pre-selected — you narrow it yourself. The reset of
  // the previous project's sprints happens in `pickProject`, not here: setState directly in an
  // effect body cascades renders (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
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
    const scoped = scope === "work" ? items.filter((i) => !isContainerType(i.type)) : items;
    if (!q) return scoped;
    return scoped.filter((i) => i.title.toLowerCase().includes(q) || i.assignedTo.toLowerCase().includes(q));
  }, [items, search, scope]);

  const rollup = useMemo(() => rollupTeam(visible, asOf ?? new Date()), [visible, asOf]);
  const averages = useMemo(() => teamAverages(rollup.members), [rollup.members]);
  // One pass to bucket items per person, so each card's sparkline doesn't re-scan the whole list.
  const itemsByMember = useMemo(() => {
    const map = new Map<string, TeamWorkItem[]>();
    for (const item of visible) {
      const key = item.assignedTo || UNASSIGNED;
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [visible]);
  const sparks = useMemo(() => {
    const now = asOf ?? new Date();
    return new Map(
      rollup.members.map((m) => [m.name, memberDetail(itemsByMember.get(m.name) ?? [], now).weekly]),
    );
  }, [rollup.members, itemsByMember, asOf]);
  const maxClosed = Math.max(1, ...rollup.members.map((m) => m.closed));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Searchable picker — there are dozens of projects, so a plain dropdown means scrolling. */}
        <Button
          variant="outline"
          size="sm"
          className="w-56 justify-between"
          disabled={loading}
          onClick={() => setPickerOpen(true)}
        >
          <span className={project ? "truncate" : "truncate text-muted-foreground"}>
            {project || "Choose a project…"}
          </span>
          <Search className="size-3.5 shrink-0 opacity-60" />
        </Button>
        <CommandDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Choose a project">
          <CommandInput placeholder="Search projects…" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup heading="Azure DevOps projects">
              {projects.map((p) => (
                <CommandItem key={p} value={p} onSelect={() => pickProject(p)}>
                  {p}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        <Select value={iteration} onValueChange={pickIteration} disabled={!project || loading}>
          <SelectTrigger className="w-48 [&>span]:truncate">
            <SelectValue placeholder="Choose a sprint…" />
          </SelectTrigger>
          <SelectContent>
            {iterations.map((it) => (
              <SelectItem key={it} value={it}>
                {iterationLabel(it)}
              </SelectItem>
            ))}
            <SelectItem value={ALL}>All sprints · slow</SelectItem>
          </SelectContent>
        </Select>

        <Select value={String(windowDays)} onValueChange={(v) => pickWindow(Number(v) as TeamWindow)} disabled={loading}>
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

        <Select value={scope} onValueChange={(v) => setScope(v as "work" | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="work">Tasks &amp; bugs</SelectItem>
            <SelectItem value="all">All item types</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or person…"
          className="w-56"
        />

        <Button variant="outline" size="sm" onClick={() => void load({ project, iteration, windowDays })} disabled={loading || !project || !iteration}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
        </Button>

      </div>

      {loading ? (
        <p className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          <span>
            Reading {project} from Azure DevOps…
            {iteration === ALL ? " Whole project — this one takes a while." : ""}
          </span>
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {truncated ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          Hit the item cap for this window — narrow the sprint or shorten the range for exact totals.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryTile label="Finished" value={String(rollup.closed)} hint={`closed in the last ${windowDays} days`} />
        <SummaryTile label="Being worked on" value={String(rollup.wip)} hint="open items right now" />
        <SummaryTile label="Bugs" value={`${Math.round(rollup.bugRatio * 100)}%`} hint="of all items in view" />
        <SummaryTile
          label="Active work time"
          value={formatDays(rollup.medianWorkDays)}
          hint={`Active → Closed · ${formatDays(rollup.medianLeadDays)} incl. backlog wait`}
        />
        <SummaryTile
          label="Estimated"
          value={`${Math.round(rollup.estimateCoverage * 100)}%`}
          hint={`of items · ${rollup.plannedHours > 0 ? `${rollup.plannedHours}h planned` : "no hours set"}`}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {!project ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" /> Choose a project above, then a sprint.
            </p>
          ) : !iteration ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" /> Pick a sprint to load {project}. &ldquo;All sprints&rdquo; reads the whole
              project and is much slower.
            </p>
          ) : rollup.members.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" /> {loading ? "Loading…" : "No work items in this window."}
            </p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {rollup.members.map((m, index) => (
                <MemberCard
                  key={m.name}
                  member={m}
                  rank={index + 1}
                  team={averages}
                  weekly={sparks.get(m.name) ?? []}
                  closedShare={m.closed / maxClosed}
                  onOpen={() => setMember(m)}
                />
              ))}
            </ul>
          )}
          <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-border/60 pt-4 text-xs sm:grid-cols-2">
            {[
              ["Finished", `Items closed inside the last ${windowDays} days.`],
              ["In progress", "Items still open right now, any age."],
              ["Active work", "Median time from Active to Closed — the real work window, backlog wait excluded."],
              ["Lead time", "Median from Created to Closed, which includes however long it sat in the backlog."],
              ["Untouched", `Open with no update for ${AGING_DAYS}+ days.`],
              ["Estimated", "Share of their items that carry an Original Estimate."],
              ["Tasks & bugs", "Stories/features/epics are excluded — they're containers for the work below them."],
            ].map(([term, meaning]) => (
              <div key={term} className="flex gap-2">
                <dt className="w-24 shrink-0 font-medium text-foreground/70">{term}</dt>
                <dd className="min-w-0 flex-1 text-muted-foreground">{meaning}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Click a person for charts, bug-vs-story timings and estimation. Read live from Azure DevOps — nothing
            stored locally.
          </p>
        </CardContent>
      </Card>

      {member ? (
        <MemberDetailDialog
          member={member}
          items={itemsByMember.get(member.name) ?? []}
          team={averages}
          project={project}
          sprint={iteration === ALL ? "All sprints" : iterationLabel(iteration)}
          windowDays={windowDays}
          open={member !== null}
          onOpenChange={(next) => {
            if (!next) setMember(null);
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

