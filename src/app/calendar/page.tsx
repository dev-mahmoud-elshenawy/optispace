import { CalendarClock } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { isCalendarEnabled } from "@/features/calendar/service";
import { CalendarView } from "@/features/calendar/components/calendar-view";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  if (!isCalendarEnabled()) {
    return (
      <PageShell title="Calendar" description="Your Outlook / Teams agenda">
        <Card className="border-dashed border-border/60">
          <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium text-foreground">Calendar not configured</p>
            <p>
              In Outlook: <span className="text-foreground">Settings → Calendar → Shared calendars → Publish a calendar</span>,
              copy the ICS link, then add it to <code className="rounded bg-muted px-1">.env</code> as{" "}
              <code className="rounded bg-muted px-1">CALENDAR_ICS_URL</code> and restart the dev server.
            </p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Calendar" description="Your Outlook / Teams agenda">
      <CalendarView />
    </PageShell>
  );
}
