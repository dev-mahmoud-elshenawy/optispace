"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardChartsProps {
  leaveByMonth: { month: string; days: number }[];
  projectProgress: { name: string; pct: number }[];
}

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

export function DashboardCharts({ leaveByMonth, projectProgress }: DashboardChartsProps) {
  const hasLeave = leaveByMonth.some((m) => m.days > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave days by month</CardTitle>
        </CardHeader>
        <CardContent>
          {hasLeave ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={leaveByMonth} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="days" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">No leave recorded this year.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project progress</CardTitle>
        </CardHeader>
        <CardContent>
          {projectProgress.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={projectProgress}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} unit="%" />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} formatter={(value) => [`${value}%`, "Complete"]} />
                <Bar dataKey="pct" fill="var(--chart-2)" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">No projects with milestones yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
