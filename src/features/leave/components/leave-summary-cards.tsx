import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LEAVE_TYPES } from "@/types";
import type { LeaveSummary } from "../service";
import { LEAVE_TYPE_LABELS } from "./leave-type-style";

interface LeaveSummaryCardsProps {
  summary: LeaveSummary;
}

export function LeaveSummaryCards({ summary }: LeaveSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
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
          <p className="text-xs text-muted-foreground">days left</p>
        </CardContent>
      </Card>
    </div>
  );
}
