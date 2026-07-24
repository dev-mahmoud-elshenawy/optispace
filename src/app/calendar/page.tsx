import { CalendarClock } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { getGraphAuthStatus } from "@/features/integrations/graph/actions";
import { isCalendarEnabled } from "@/features/calendar/service";
import { calendarRange } from "@/features/calendar/queries";
import { CalendarView } from "@/features/calendar/components/calendar-view";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [graph, icsEnabled] = await Promise.all([getGraphAuthStatus(), isCalendarEnabled()]);
  if (!graph.connected && !icsEnabled) {
    return (
      <PageShell title="Calendar" description="Your Outlook / Teams agenda">
        <Card className="border-dashed border-border/60">
          <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium text-foreground">Calendar not connected</p>
            <p>
              Connect via <span className="text-foreground">Settings → Microsoft Calendar (Graph)</span> for full
              read-write, or add a published <span className="text-foreground">ICS feed URL</span> there for a
              read-only view (no login required).
            </p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // Read the cached window server-side so the calendar renders with data immediately
  // (no client round-trip / spinner on mount). Background sync updates it via the
  // `optispace:calendar-updated` event only when the cache actually changed.
  const now = new Date();
  const initialEvents = await calendarRange(
    new Date(now.getTime() - 31 * 86_400_000),
    new Date(now.getTime() + 186 * 86_400_000),
  );

  return (
    <PageShell title="Calendar" description="Your Outlook / Teams agenda">
      <CalendarView initialEvents={initialEvents} />
    </PageShell>
  );
}
