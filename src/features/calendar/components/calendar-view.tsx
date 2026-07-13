"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Clock, MapPin, Loader2, Users, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCalendarRange } from "@/features/calendar/actions";
import type { CalendarEventDTO } from "@/features/calendar/types";

type View = "month" | "day";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
// Events overlapping a given calendar day.
function eventsForDay(events: CalendarEventDTO[], day: Date): CalendarEventDTO[] {
  return events.filter((e) => new Date(e.start) <= endOfDay(day) && new Date(e.end) >= startOfDay(day));
}

export function CalendarView({ initialEvents }: { initialEvents: CalendarEventDTO[] }) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEventDTO[]>(initialEvents);
  const [loading, setLoading] = useState(false);

  // Data arrives server-rendered (initialEvents) — no fetch on mount, so the page
  // renders instantly. Month/day navigation filters in-memory. Only re-read from the
  // DB when the background sync signals the cache actually changed.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 31 * 86_400_000);
      const to = new Date(now.getTime() + 186 * 86_400_000);
      const data = await getCalendarRange(from.toISOString(), to.toISOString());
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onUpdate = () => void load();
    window.addEventListener("optispace:calendar-updated", onUpdate);
    return () => window.removeEventListener("optispace:calendar-updated", onUpdate);
  }, [load]);

  const monthKey = format(cursor, "yyyy-MM");
  const gridDays = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor));
    const gridEnd = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  const dayEvents = useMemo(
    () => eventsForDay(events, selectedDay).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [events, selectedDay],
  );

  function goToday() {
    const today = new Date();
    setCursor(today);
    setSelectedDay(today);
  }

  // Prev/next steps by day in day view, by month in month view.
  function step(delta: number) {
    if (view === "day") {
      const next = addDays(selectedDay, delta);
      setSelectedDay(next);
      setCursor(next); // keep the month aligned so the cached window covers it
    } else {
      setCursor(addMonths(cursor, delta));
    }
  }

  function openDay(day: Date) {
    setSelectedDay(day);
    setView("day");
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label={view === "day" ? "Previous day" : "Previous month"}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => step(1)} aria-label={view === "day" ? "Next day" : "Next month"}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-1 font-heading text-lg font-semibold tracking-tight">
            {format(view === "day" ? selectedDay : cursor, view === "day" ? "EEEE, MMM d, yyyy" : "MMMM yyyy")}
          </h2>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setView("month")}
            className={cn("px-3 py-1.5 text-sm", view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => setView("day")}
            className={cn("px-3 py-1.5 text-sm", view === "day" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            Day
          </button>
        </div>
      </div>

      {view === "month" ? (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {gridDays.map((day) => {
              const evs = eventsForDay(events, day);
              const inMonth = isSameMonth(day, cursor);
              const today = isToday(day);
              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  onClick={() => openDay(day)}
                  className={cn(
                    "min-h-24 border-b border-r border-border/40 p-1.5 text-left align-top transition-colors hover:bg-accent/40",
                    !inMonth && "bg-muted/20 text-muted-foreground/50",
                  )}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                        today && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, MAX_CHIPS).map((e) => (
                      <div
                        key={e.id}
                        className="truncate rounded bg-primary/15 px-1 py-0.5 text-[10px] leading-tight text-primary"
                        title={e.title}
                      >
                        {e.allDay ? "" : format(new Date(e.start), "h:mm a") + " "}
                        {e.title}
                      </div>
                    ))}
                    {evs.length > MAX_CHIPS ? (
                      <div className="px-1 text-[10px] text-muted-foreground">+{evs.length - MAX_CHIPS} more</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60">
          {dayEvents.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No meetings on this day.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {dayEvents.map((e) => (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex w-16 shrink-0 items-center gap-1 pt-0.5 text-xs tabular-nums text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    {e.allDay ? "All day" : format(new Date(e.start), "h:mm a")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{e.title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      {!e.allDay ? (
                        <span>
                          {format(new Date(e.start), "h:mm a")} – {format(new Date(e.end), "h:mm a")}
                        </span>
                      ) : null}
                      {e.location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {e.location}
                        </span>
                      ) : null}
                      {e.meetingUrl ? (
                        <a
                          href={e.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          <Video className="h-3 w-3" /> Join
                        </a>
                      ) : null}
                    </div>
                    {e.attendees.length > 0 ? (
                      <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                        <Users className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          {e.attendees.slice(0, 6).join(", ")}
                          {e.attendees.length > 6 ? ` +${e.attendees.length - 6} more` : ""}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
