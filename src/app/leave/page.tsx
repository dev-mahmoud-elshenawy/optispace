import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { AllowanceDialog } from "@/features/leave/components/allowance-dialog";
import { LeaveCalendar } from "@/features/leave/components/leave-calendar";
import { LeaveFormDialog } from "@/features/leave/components/leave-form-dialog";
import { LeaveHistory } from "@/features/leave/components/leave-history";
import { LeaveSummaryCards } from "@/features/leave/components/leave-summary-cards";
import { getAllowance, listLeaves } from "@/features/leave/queries";
import { computeSummary } from "@/features/leave/service";

interface LeavePageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function LeavePage({ searchParams }: LeavePageProps) {
  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getFullYear();
  const parsedYear = yearParam ? Number(yearParam) : currentYear;
  const year = Number.isInteger(parsedYear) ? parsedYear : currentYear;

  const [allowanceDays, leaves] = await Promise.all([getAllowance(year), listLeaves(year)]);
  const summary = computeSummary(allowanceDays, leaves);
  const initialMonth = year === currentYear ? new Date() : new Date(year, 0, 1);

  return (
    <PageShell
      title="Annual Leave"
      description="Track your leave allowance, history, and calendar."
      actions={
        <>
          <AllowanceDialog year={year} currentDays={allowanceDays} />
          <LeaveFormDialog trigger={<Button>Log leave</Button>} />
        </>
      }
    >
      <div className="mb-6 flex items-center justify-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/leave?year=${year - 1}`}>
            <ChevronLeftIcon />
            <span className="sr-only">Previous year</span>
          </Link>
        </Button>
        <p className="text-lg font-semibold tabular-nums">{year}</p>
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/leave?year=${year + 1}`}>
            <ChevronRightIcon />
            <span className="sr-only">Next year</span>
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        <LeaveSummaryCards summary={summary} />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <LeaveCalendar key={year} leaves={leaves} initialMonth={initialMonth} />
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">History</h2>
            <LeaveHistory leaves={leaves} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
