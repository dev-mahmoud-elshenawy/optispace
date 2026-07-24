"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, CalendarDays, Clock, Video } from "lucide-react";

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

// One panel, Today/Tomorrow toggle. Both days' data is passed pre-shaped from the
// dashboard (Server Component) so the client just switches which one it renders.
// Styled as a full-height scrollable bento panel to match Notifications / Pull requests.
export function DayPreviewCard({ today, tomorrow }: { today: DayData; tomorrow: DayData }) {
  const [view, setView] = useState<"today" | "tomorrow">("today");
  const data = view === "today" ? today : tomorrow;
  const empty = view === "today" ? "Nothing due today — you're all clear." : "Nothing scheduled for tomorrow.";
  const isEmpty = data.events.length === 0 && data.tasks.length === 0 && data.onLeave.length === 0;

  let row = 0; // stagger index across all rows of the active view

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/50 backdrop-blur transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
        <span className="block h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-sheen" />
      </span>
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-chart-2/10 text-primary ring-1 ring-inset ring-primary/20">
          <CalendarClock className="size-4" />
        </span>
        <span className="font-heading text-sm font-semibold">Agenda</span>
        <div className="ml-auto inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
          {(["today", "tomorrow"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium capitalize transition-all duration-200",
                view === v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* scrollable body */}
      <div key={view} className="panel-scroll scroll-mask flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {data.onLeave.map((l) => (
          <PanelRow key={l.id} index={row++}>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/40">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span>On leave {view}</span>
              <span className="ml-auto text-xs text-muted-foreground">until {format(new Date(l.until), "MMM d")}</span>
            </div>
          </PanelRow>
        ))}

        {data.events.length > 0 ? (
          <div className="space-y-1">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Meetings</p>
            {data.events.map((e) => (
              <PanelRow key={e.id} index={row++}>
                <MeetingRow event={e} />
              </PanelRow>
            ))}
          </div>
        ) : null}

        {data.tasks.length > 0 ? (
          <div className="space-y-1">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Tasks due</p>
            {data.tasks.map((t) => (
              <PanelRow key={t.id} index={row++}>
                <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/40">
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
              </PanelRow>
            ))}
          </div>
        ) : null}

        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CalendarClock className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">{empty}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// staggered entrance for each list row
function PanelRow({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      {children}
    </div>
  );
}

function MeetingRow({ event }: { event: CalendarEventDTO }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/40">
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
