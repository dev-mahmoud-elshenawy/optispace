import type { ComponentType, ReactNode } from "react";
import { CalendarDays, CalendarCheck2, Plane, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LEAVE_TYPES } from "@/types";
import type { LeaveSummary } from "../service";
import { LEAVE_TYPE_LABELS } from "./leave-type-style";

interface LeaveSummaryCardsProps {
  summary: LeaveSummary;
}

// Monthly-accrual basis: rate = yearly allowance / 12. Accrued-to-date grows each
// completed month, so the balance moves toward year-end remaining over time.
// getMonth() = completed months this year (Jan=0): mid-May=4 → -5, mid-July=6 → -1.5.
export function LeaveSummaryCards({ summary }: LeaveSummaryCardsProps) {
  const now = new Date();
  const monthsAccrued = now.getMonth();
  const monthlyRate = summary.allowanceDays / 12;
  const accruedDays = Math.round(monthlyRate * monthsAccrued * 100) / 100;
  const currentBalance = accruedDays - summary.usedDays;
  const asOfLabel = now.toLocaleString("en-US", { month: "short" });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <LeaveStat icon={CalendarDays} label="Allowance" value={summary.allowanceDays}>
        days for the year
      </LeaveStat>

      <LeaveStat icon={Plane} label="Used" value={summary.usedDays}>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {LEAVE_TYPES.map((type) => (
            <span key={type}>
              {LEAVE_TYPE_LABELS[type]}: <span className="font-mono tabular-nums text-foreground/80">{summary.byType[type]}</span>
            </span>
          ))}
        </div>
      </LeaveStat>

      <LeaveStat icon={CalendarCheck2} label="Remaining" value={summary.remainingDays} negative={summary.remainingDays < 0}>
        days left (year-end)
      </LeaveStat>

      <LeaveStat icon={Scale} label="Current balance" value={currentBalance} negative={currentBalance < 0}>
        {monthlyRate.toFixed(2)} days/mo · {accruedDays} accrued by {asOfLabel}
      </LeaveStat>
    </div>
  );
}

function LeaveStat({
  icon: Icon,
  label,
  value,
  negative = false,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  negative?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-chart-2/10 text-primary ring-1 ring-inset ring-primary/15">
            <Icon className="size-3.5" />
          </span>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("font-mono text-3xl font-semibold tabular-nums tracking-tight", negative && "text-destructive")}>
          {value}
        </p>
        <div className="mt-1.5 text-xs text-muted-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}
