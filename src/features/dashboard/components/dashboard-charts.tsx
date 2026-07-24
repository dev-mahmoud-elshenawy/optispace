"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardChartsProps {
  leaveByMonth: { month: string; days: number }[];
}

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

export function DashboardCharts({ leaveByMonth }: DashboardChartsProps) {
  const hasLeave = leaveByMonth.some((m) => m.days > 0);

  return (
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
  );
}
