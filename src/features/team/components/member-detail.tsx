"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { avatarColor } from "@/lib/avatar";
import { AzureDevOpsTaskDetail } from "@/features/integrations/azure-devops/task-detail";
import { workItemStateColor, workItemTypeColor } from "@/features/integrations/azure-devops/types";

import { formatDays, initials, iterationLabel, memberDetail } from "../service";
import { AGING_DAYS, type TeamMemberStats, type TeamWorkItem } from "../types";

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

interface MemberDetailDialogProps {
  member: TeamMemberStats;
  items: TeamWorkItem[]; // this member's items only
  windowDays: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemberDetailDialog({ member, items, windowDays, open, onOpenChange }: MemberDetailDialogProps) {
  const [openItem, setOpenItem] = useState<string | null>(null);
  const detail = useMemo(() => memberDetail(items, new Date()), [items]);
  const sorted = useMemo(
    () => [...items].sort((a, b) => (b.changedDate ?? "").localeCompare(a.changedDate ?? "")),
    [items],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 pr-6">
            <span
              className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(member.name)}`}
            >
              {initials(member.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{member.name}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {member.email ?? "no email"} · last {windowDays} days
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          {/* Plain-language headline numbers — each one says what it actually counts. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Finished" value={String(member.closed)} note={`closed in the last ${windowDays} days`} />
            <Stat label="Working on now" value={String(member.wip)} note={`${member.inProgress} actively in progress`} />
            <Stat
              label="Usual time to finish"
              value={formatDays(member.medianCycleDays)}
              note={
                detail.fastestDays !== null
                  ? `fastest ${formatDays(detail.fastestDays)} · slowest ${formatDays(detail.slowestDays)}`
                  : "nothing closed yet"
              }
            />
            <Stat
              label="Untouched work"
              value={String(member.aging)}
              note={
                detail.oldestOpenDays !== null
                  ? `no update in ${AGING_DAYS}+ days · oldest ${formatDays(detail.oldestOpenDays)}`
                  : `no update in ${AGING_DAYS}+ days`
              }
            />
          </div>

          <Chart title="Finished per month" hint="Steady, ramping up, or stalled?" data={detail.closedByMonth} />

          <Chart
            title="How long items took to finish"
            hint="The spread, not an average. A tall bar on the right means work sat around; one lone spike usually means a bulk close in Azure DevOps rather than real effort."
            data={detail.cycleBuckets}
            color="var(--chart-2)"
          />

          <Chart title="Finished per sprint" hint="Which sprints they actually delivered in." data={detail.closedBySprint} />

          {/* Bugs vs stories — the "what eats the time" table. */}
          <section>
            <h4 className="font-medium">Bugs vs feature work</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              How many of each kind, how long they take to close, and the hours planned for them.
            </p>
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
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {t.plannedHours > 0 ? t.plannedHours : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Estimation. Accuracy needs BOTH an estimate and logged work; this org fills in the
              first and never the second, so we say so instead of inventing a ratio. */}
          <section>
            <h4 className="font-medium">Estimation</h4>
            <p className="mb-2 text-xs text-muted-foreground">
              Coverage is how much of their work carries an estimate at all — the discipline signal.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="Estimated"
                value={`${Math.round(member.estimateCoverage * 100)}%`}
                note={`${member.estimated} of ${member.total} items have an estimate`}
              />
              <Stat
                label="Planned hours"
                value={member.plannedHours > 0 ? String(member.plannedHours) : "—"}
                note="sum of Original Estimate"
              />
              <Stat
                label="Estimate vs actual"
                value={member.accuracy !== null ? `${member.accuracy.toFixed(2)}×` : "not tracked"}
                note={
                  member.accuracy !== null
                    ? "median logged ÷ planned (1.00× = spot on)"
                    : "needs Completed Work in Azure DevOps — currently never filled in"
                }
              />
            </div>
          </section>

          <div className="grid gap-6 sm:grid-cols-2">
            <Legend
              title="Kind of work"
              hint="Bug-heavy vs feature-heavy."
              rows={detail.typeMix.map((t) => ({ ...t, color: workItemTypeColor(t.label) }))}
            />
            <Legend
              title="Open work by state"
              hint="Where their current items are sitting."
              rows={detail.openByState.map((s) => ({ ...s, color: workItemStateColor(s.label) }))}
            />
          </div>

          <section>
            <h4 className="mb-2 font-medium">All items ({sorted.length})</h4>
            <ul className="space-y-1">
              {sorted.map((i) => (
                <li key={i.externalId}>
                  <button
                    type="button"
                    onClick={() => setOpenItem(i.externalId)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-left hover:bg-accent/60"
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
          </section>
        </div>

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

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Chart({
  title,
  hint,
  data,
  color = "var(--chart-1)",
}: {
  title: string;
  hint: string;
  data: { label: string; count: number }[];
  color?: string;
}) {
  const hasData = data.some((d) => d.count > 0);
  return (
    <section>
      <h4 className="font-medium">{title}</h4>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      {hasData ? (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
          Nothing to show for this window.
        </p>
      )}
    </section>
  );
}

function Legend({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: { label: string; count: number; color: string }[];
}) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <section>
      <h4 className="font-medium">{title}</h4>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {rows.map((r) => (
              <div key={r.label} style={{ width: `${(r.count / total) * 100}%`, backgroundColor: r.color }} />
            ))}
          </div>
          <ul className="mt-2 space-y-1">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: r.color }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.label}</span>
                <span className="font-mono tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
