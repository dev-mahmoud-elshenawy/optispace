"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, CalendarDays, Clock, Video } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { STATUS_DOT_CLASS } from "@/features/tasks/service";
import type { CalendarEventDTO } from "@/features/calendar/types";
import type { TaskStatus } from "@/types";

interface DayTask {
  id: string;
  title: string;
  status: TaskStatus;
  badge: string;
  overdue: boolean;
}

interface DayLeave {
  id: string;
  until: string; // ISO end date
}

export interface DayData {
  events: CalendarEventDTO[];
  tasks: DayTask[];
  onLeave: DayLeave[];
}

// One card, Today/Tomorrow toggle. Both days' data is passed pre-shaped from the
// dashboard (Server Component) so the client just switches which one it renders.
export function DayPreviewCard({ today, tomorrow }: { today: DayData; tomorrow: DayData }) {
  const [view, setView] = useState<"today" | "tomorrow">("today");
  const data = view === "today" ? today : tomorrow;
  const empty = view === "today" ? "Nothing due today — you're all clear." : "Nothing scheduled for tomorrow.";

  return (
    <Card className="border-border/60 transition-colors hover:border-border">
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <CalendarClock className="h-3.5 w-3.5" />
          </span>
          Calendar
        </CardTitle>
        <div className="inline-flex w-fit rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
          {(["today", "tomorrow"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1 font-medium capitalize transition-colors",
                view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.onLeave.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span>On leave {view}</span>
            <span className="ml-auto text-xs text-muted-foreground">until {format(new Date(l.until), "MMM d")}</span>
          </div>
        ))}

        {data.events.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Meetings</p>
            {data.events.map((e) => (
              <MeetingRow key={e.id} event={e} />
            ))}
          </div>
        ) : null}

        {data.tasks.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Tasks due</p>
            {data.tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[t.status]}`} />
                  <span className="truncate">{t.title}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs",
                    t.overdue ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary",
                  )}
                >
                  {t.badge}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {data.events.length === 0 && data.tasks.length === 0 && data.onLeave.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{empty}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MeetingRow({ event }: { event: CalendarEventDTO }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
        {event.allDay ? "All day" : format(new Date(event.start), "h:mm a")}
      </span>
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      {event.meetingUrl ? (
        <a
          href={event.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Video className="h-3 w-3" /> Join
        </a>
      ) : event.location ? (
        <span className="shrink-0 max-w-[40%] truncate text-xs text-muted-foreground">{event.location}</span>
      ) : null}
    </div>
  );
}
