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
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Allowance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{summary.allowanceDays}</p>
          <p className="text-xs text-muted-foreground">days for the year</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Used</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{summary.usedDays}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {LEAVE_TYPES.map((type) => (
              <span key={type}>
                {LEAVE_TYPE_LABELS[type]}: {summary.byType[type]}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Remaining</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={cn("text-2xl font-semibold", summary.remainingDays < 0 && "text-destructive")}>
            {summary.remainingDays}
          </p>
          <p className="text-xs text-muted-foreground">days left (year-end)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Current balance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={cn("text-2xl font-semibold", currentBalance < 0 && "text-destructive")}>
            {currentBalance}
          </p>
          <p className="text-xs text-muted-foreground">
            {monthlyRate.toFixed(2)} days/mo · {accruedDays} accrued by {asOfLabel}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
