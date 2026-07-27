"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, ClipboardCopy, Eye, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { avatarColor } from "@/lib/avatar";
import { AzureDevOpsTaskDetail } from "@/features/integrations/azure-devops/task-detail";
import { workItemStateColor, workItemTypeColor } from "@/features/integrations/azure-devops/types";

import {
  formatDays,
  initials,
  iterationLabel,
  memberDetail,
  memberInsights,
  memberReportMarkdown,
} from "../service";
import { AGING_DAYS, type Insight, type TeamAverages, type TeamMemberStats, type TeamWorkItem } from "../types";

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

const TONE: Record<Insight["tone"], { chip: string; icon: typeof CheckCircle2 }> = {
  good: { chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300", icon: CheckCircle2 },
  watch: { chip: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300", icon: Eye },
  risk: { chip: "border-destructive/30 bg-destructive/10 text-destructive", icon: AlertTriangle },
};

interface MemberDetailDialogProps {
  member: TeamMemberStats;
  items: TeamWorkItem[]; // this member's items only
  team: TeamAverages;
  project: string;
  sprint: string;
  windowDays: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemberDetailDialog({
  member,
  items,
  team,
  project,
  sprint,
  windowDays,
  open,
  onOpenChange,
}: MemberDetailDialogProps) {
  const [openItem, setOpenItem] = useState<string | null>(null);
  const detail = useMemo(() => memberDetail(items, new Date()), [items]);
  const insights = useMemo(() => memberInsights(member, detail, team), [member, detail, team]);
  const sorted = useMemo(
    () => [...items].sort((a, b) => (b.changedDate ?? "").localeCompare(a.changedDate ?? "")),
    [items],
  );

  async function copyReport() {
    const markdown = memberReportMarkdown({ member, detail, insights, team, project, sprint, windowDays });
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Evaluation report copied as Markdown.");
    } catch {
      toast.error("Couldn't access the clipboard.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 pr-6">
            <span
              className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(member.name)}`}
            >
              {initials(member.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{member.name}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {member.email ?? "no email"} · {project} · {sprint} · last {windowDays} days
              </span>
            </span>
            <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={copyReport}>
              <ClipboardCopy /> Copy report
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Headline scorecard: their number, then the team's, so every figure reads as relative. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat
            label="Finished"
            value={String(member.closed)}
            compare={`team avg ${team.closedPerMember.toFixed(1)}`}
            good={team.closedPerMember > 0 ? member.closed >= team.closedPerMember : null}
          />
          <Stat
            label={member.medianWorkDays !== null ? "Time in progress" : "Time in progress (n/a)"}
            value={formatDays(member.medianWorkDays)}
            compare={
              member.medianWorkDays !== null
                ? `Active → Closed calendar time · team ${formatDays(team.medianWorkDays)} · slow tail ${formatDays(detail.p85WorkDays)}`
                : "no closed item recorded an Active date — use lead time"
            }
            good={
              member.medianWorkDays !== null && team.medianWorkDays !== null
                ? member.medianWorkDays <= team.medianWorkDays
                : null
            }
          />
          <Stat
            label="Waited before start"
            value={formatDays(member.medianWaitDays)}
            compare={`Created → Active · lead time ${formatDays(member.medianLeadDays)} end to end`}
            good={null}
          />
          <Stat
            label="Bug share"
            value={`${Math.round(member.bugRatio * 100)}%`}
            compare={`team ${Math.round(team.bugRatio * 100)}%`}
            good={member.bugRatio <= team.bugRatio}
          />
          <Stat
            label="Open now"
            value={String(member.wip)}
            compare={`${member.inProgress} in progress · ${member.aging} untouched ${AGING_DAYS}d+`}
            good={member.aging === 0 ? true : null}
          />
        </div>

        {/* The actual evaluation: what the numbers mean, comparatively. */}
        <ul className="space-y-2">
          {insights.map((insight, index) => {
            const tone = TONE[insight.tone];
            const Icon = tone.icon;
            return (
              <li key={index} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${tone.chip}`}>
                <Icon className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 text-foreground/90">{insight.text}</span>
              </li>
            );
          })}
        </ul>

        <Tabs defaultValue="delivery">
          <TabsList>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
            <TabsTrigger value="quality">Work mix</TabsTrigger>
            <TabsTrigger value="estimation">Estimation</TabsTrigger>
            <TabsTrigger value="items">Items ({sorted.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="mt-4 space-y-6">
            <Panel title="Finished per week" hint="Rhythm over the last 8 weeks — gaps are as telling as peaks.">
              {detail.weekly.some((w) => w.count > 0) ? (
                <ResponsiveContainer width="100%" height={170}>
                  <AreaChart data={detail.weekly} margin={{ top: 14, right: 18, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="weeklyFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.15))]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      fill="url(#weeklyFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Empty />
              )}
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel
                title="How long items sat in progress"
                hint={`Each bar counts finished items by how long they stayed in progress — Active to Closed calendar time, so backlog waiting is excluded. This is elapsed time, NOT hours worked; hours live in the Effort field. ${
                  detail.cycleBuckets.reduce((sum, b) => sum + b.count, 0) > 0
                    ? `${detail.cycleBuckets[0].count + detail.cycleBuckets[1].count} of ${detail.cycleBuckets.reduce((sum, b) => sum + b.count, 0)} took 3 days or less.`
                    : ""
                }${
                  detail.activatedCoverage < 1
                    ? ` ${Math.round((1 - detail.activatedCoverage) * 100)}% of their finished items were never set to Active, so they can't be measured this way and are left out.`
                    : ""
                }`}
              >
                <Bars data={detail.cycleBuckets} color="var(--chart-2)" />
              </Panel>
              <Panel
                title="How long their open work has been sitting"
                hint={`Open items by time since anyone last touched them. The right-hand bars are the sweep list for your next 1:1 — ${detail.neverUpdated > 0 ? `${detail.neverUpdated} of them have never been updated since creation.` : "none have gone untouched since creation."}`}
              >
                <Bars data={detail.openAgeBuckets} color="var(--chart-4)" />
              </Panel>
            </div>

            {/* Pointless when the filter already pins one sprint — it would be a single bar. */}
            {detail.closedBySprint.length > 1 ? (
              <Panel title="Finished per sprint" hint="Which sprints they actually delivered in.">
                <Bars data={detail.closedBySprint} />
              </Panel>
            ) : null}
          </TabsContent>

          <TabsContent value="quality" className="mt-4 space-y-6">
            <Panel title="Bugs vs feature work" hint="How long each kind takes, and the hours planned for them.">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border/60 text-left">
                      <th className="py-1.5 font-medium">Type</th>
                      <th className="py-1.5 text-right font-medium">Items</th>
                      <th className="py-1.5 text-right font-medium">Finished</th>
                      <th className="py-1.5 text-right font-medium">Usual time</th>
                      <th className="py-1.5 text-right font-medium">Planned hrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.byType.map((t) => (
                      <tr key={t.label} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="size-2.5 shrink-0 rounded-[3px]"
                              style={{ backgroundColor: workItemTypeColor(t.label) }}
                            />
                            {t.label}
                          </span>
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{t.count}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{t.closed}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{formatDays(t.medianDays)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{t.plannedHours || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title="Responsiveness & board hygiene"
              hint="Whether Azure DevOps is actually kept current. Comment-reply latency isn't available without a per-item history call, so these are the honest proxies."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat
                  label="Open items last updated"
                  value={formatDays(detail.medianUpdateAgeDays)}
                  compare="median age of the last edit on their open work"
                  good={detail.medianUpdateAgeDays !== null ? detail.medianUpdateAgeDays <= AGING_DAYS : null}
                />
                <Stat
                  label="Never updated"
                  value={String(detail.neverUpdated)}
                  compare={`open ${AGING_DAYS}d+ and untouched since creation`}
                  good={detail.neverUpdated === 0}
                />
                <Stat
                  label="Bug vs feature time"
                  value={formatDays(detail.bugFixDays)}
                  compare={`bugs vs ${formatDays(detail.featureFixDays)} for feature work`}
                  good={
                    detail.bugFixDays !== null && detail.featureFixDays !== null
                      ? detail.bugFixDays <= detail.featureFixDays * 1.5
                      : null
                  }
                />
              </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Kind of work" hint="Bug-heavy vs feature-heavy.">
                <Donut rows={detail.typeMix.map((t) => ({ ...t, color: workItemTypeColor(t.label) }))} />
              </Panel>
              <Panel title="Open work by state" hint="Where their current items are sitting.">
                <Donut rows={detail.openByState.map((s) => ({ ...s, color: workItemStateColor(s.label) }))} />
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="estimation" className="mt-4">
            <Panel
              title="Effort & estimation"
              hint="Effort is the field your team actually fills in. Original Estimate is planned hours, and Completed Work (hour-level actuals) only exists in projects whose template includes it — where it's missing, the ratio is left blank rather than invented."
            >
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Stat
                  label="Estimated"
                  value={`${Math.round(member.estimateCoverage * 100)}%`}
                  compare={`${member.estimated} of ${member.total} items · team ${Math.round(team.estimateCoverage * 100)}%`}
                  good={member.estimateCoverage >= team.estimateCoverage}
                />
                <Stat
                  label="Planned hours"
                  value={member.plannedHours > 0 ? String(member.plannedHours) : "—"}
                  compare="sum of Original Estimate"
                  good={null}
                />
                <Stat
                  label="Effort logged"
                  value={member.storyPoints > 0 ? String(member.storyPoints) : "—"}
                  compare={`ADO Effort field · on ${member.effortItems} of ${member.total} items`}
                  good={member.total > 0 ? member.effortItems / member.total >= 0.5 : null}
                />
                <Stat
                  label="Actual hours"
                  value={member.loggedHours > 0 ? String(member.loggedHours) : "not filled in"}
                  compare={
                    member.loggedHours > 0
                      ? "sum of Completed Work"
                      : "Completed Work isn't part of this project's template"
                  }
                  good={null}
                />
                {member.remainingHours > 0 ? (
                  <Stat
                    label="Remaining hours"
                    value={String(member.remainingHours)}
                    compare="sum of Remaining Work"
                    good={null}
                  />
                ) : null}
                <Stat
                  label="Estimate vs actual"
                  value={member.accuracy !== null ? `${member.accuracy.toFixed(2)}×` : "not tracked"}
                  compare={
                    member.accuracy !== null
                      ? "median logged ÷ planned (1.00× = spot on)"
                      : "needs Completed Work in Azure DevOps"
                  }
                  good={null}
                />
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="items" className="mt-4">
            <ul className="space-y-1">
              {sorted.map((i) => (
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
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>

        {openItem ? (
          <AzureDevOpsTaskDetail
            externalId={openItem}
            open={openItem !== null}
            onOpenChange={(next) => {
              if (!next) setOpenItem(null);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// `good` tints the comparison line: true = ahead of the team, false = behind, null = no judgement
// (some numbers, like planned hours, aren't better or worse).
function Stat({
  label,
  value,
  compare,
  good,
}: {
  label: string;
  value: string;
  compare: string;
  good: boolean | null;
}) {
  const tint =
    good === null
      ? "text-muted-foreground"
      : good
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-amber-600 dark:text-amber-400";
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3.5 backdrop-blur">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{value}</p>
      <p className={`mt-0.5 text-xs ${tint}`}>{compare}</p>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <p className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
      Nothing to show for this window.
    </p>
  );
}

function Bars({ data, color = "var(--chart-1)" }: { data: { label: string; count: number }[]; color?: string }) {
  if (!data.some((d) => d.count > 0)) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={data} margin={{ top: 14, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} />
        <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Donut({ rows }: { rows: { label: string; count: number; color: string }[] }) {
  if (rows.length === 0) return <Empty />;
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="45%" height={150}>
        <PieChart>
          <Pie data={rows} dataKey="count" nameKey="label" innerRadius={38} outerRadius={62} paddingAngle={2}>
            {rows.map((r) => (
              <Cell key={r.label} fill={r.color} stroke="var(--background)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: r.color }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.label}</span>
            <span className="font-mono tabular-nums">{r.count}</span>
            <span className="w-9 text-right font-mono text-muted-foreground tabular-nums">
              {Math.round((r.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
