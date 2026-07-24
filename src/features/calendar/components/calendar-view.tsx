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
import { ChevronLeft, ChevronRight, Clock, ListPlus, MapPin, Loader2, Plus, Search, Users, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCalendarRange } from "@/features/calendar/actions";
import type { CalendarEventDTO } from "@/features/calendar/types";
import { createTask } from "@/features/tasks/actions";
import { EventDialog } from "./event-dialog";

type View = "month" | "day" | "agenda";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;
const AGENDA_WINDOWS = [7, 14, 30] as const;

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
  const [agendaDays, setAgendaDays] = useState<number>(7);
  const [search, setSearch] = useState("");
  const [creatingPrep, setCreatingPrep] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventDTO | null>(null);

  function openCreate() {
    setEditingEvent(null);
    setDialogOpen(true);
  }
  function openEvent(e: CalendarEventDTO) {
    setEditingEvent(e);
    setDialogOpen(true);
  }

  // One-way "prep task from a meeting" — no durable link back to the event, since ICS
  // occurrences are re-synced/pruned each poll (an event id isn't a stable FK).
  async function addPrepTask(e: CalendarEventDTO) {
    setCreatingPrep(e.id);
    try {
      const res = await createTask({
        title: `Prep: ${e.title}`,
        status: "todo",
        priority: "medium",
        dueDate: e.start,
      });
      if (res.ok) {
        toast.success("Prep task created.");
      } else {
        toast.error(res.error);
      }
    } finally {
      setCreatingPrep(null);
    }
  }

  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? events.filter((e) => e.title.toLowerCase().includes(q)) : events;
  }, [events, search]);

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
    () => eventsForDay(visibleEvents, selectedDay).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [visibleEvents, selectedDay],
  );

  // Flat "next N days" list, grouped by day (only days with events). Anchored on
  // today, ignores the month cursor. Events already in progress fold into today.
  const agendaGroups = useMemo(() => {
    const from = startOfDay(new Date());
    const to = endOfDay(addDays(from, agendaDays - 1));
    const groups = new Map<string, { day: Date; events: CalendarEventDTO[] }>();
    visibleEvents
      .filter((e) => new Date(e.end) >= from && new Date(e.start) <= to)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .forEach((e) => {
        const s = new Date(e.start);
        const bucket = s < from ? from : startOfDay(s);
        const key = format(bucket, "yyyy-MM-dd");
        const group = groups.get(key) ?? { day: bucket, events: [] };
        group.events.push(e);
        groups.set(key, group);
      });
    return [...groups.values()];
  }, [visibleEvents, agendaDays]);

  function goToday() {
    const today = new Date();
    setCursor(today);
    setSelectedDay(today);
  }

  // Prev/next steps by day in day view, by month in month view. No-op in agenda
  // (it's anchored on today).
  function step(delta: number) {
    if (view === "agenda") {
      return;
    }
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
          {view !== "agenda" ? (
            <>
              <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label={view === "day" ? "Previous day" : "Previous month"}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>
                Today
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => step(1)} aria-label={view === "day" ? "Next day" : "Next month"}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : null}
          <h2 className={cn("font-heading text-lg font-semibold tracking-tight", view !== "agenda" && "ml-1")}>
            {view === "agenda"
              ? `Agenda · Next ${agendaDays} days`
              : format(view === "day" ? selectedDay : cursor, view === "day" ? "EEEE, MMM d, yyyy" : "MMMM yyyy")}
          </h2>
          {view === "agenda" ? (
            <div className="ml-1 flex overflow-hidden rounded-lg border border-border">
              {AGENDA_WINDOWS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setAgendaDays(d)}
                  className={cn(
                    "px-2.5 py-1 text-xs tabular-nums transition-colors",
                    agendaDays === d ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          ) : null}
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              className="h-8 w-40 rounded-lg border border-border bg-transparent pl-8 pr-2 text-sm outline-none transition-colors focus:border-primary focus:w-52"
            />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setView("month")}
            className={cn("px-3 py-1.5 text-sm transition-colors", view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => setView("day")}
            className={cn("px-3 py-1.5 text-sm transition-colors", view === "day" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => setView("agenda")}
            className={cn("px-3 py-1.5 text-sm transition-colors", view === "agenda" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            Agenda
          </button>
          </div>
        </div>
      </div>

      <div
        key={`${view}:${view === "month" ? monthKey : view === "day" ? format(selectedDay, "yyyy-MM-dd") : agendaDays}`}
        className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out fill-mode-both"
      >
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
              const evs = eventsForDay(visibleEvents, day);
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
      ) : view === "day" ? (
        <div className="rounded-xl border border-border/60">
          {dayEvents.length === 0 ? (
            <EmptyState message="No meetings on this day." />
          ) : (
            <div className="divide-y divide-border/50">
              {dayEvents.map((e) => (
                <EventRow key={e.id} e={e} onAddTask={() => addPrepTask(e)} onEdit={() => openEvent(e)} busy={creatingPrep === e.id} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60">
          {agendaGroups.length === 0 ? (
            <EmptyState message={`No meetings in the next ${agendaDays} days.`} />
          ) : (
            <div className="divide-y divide-border/50">
              {agendaGroups.map(({ day, events: dayEvs }) => (
                <div key={day.toISOString()}>
                  <div className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-border/40 bg-muted/40 px-4 py-1.5 backdrop-blur">
                    <span className={cn("text-sm font-semibold", isToday(day) && "text-primary")}>
                      {format(day, "EEE, MMM d")}
                    </span>
                    {isToday(day) ? <span className="text-xs text-primary">Today</span> : null}
                  </div>
                  <div className="divide-y divide-border/50">
                    {dayEvs.map((e) => (
                      <EventRow key={e.id} e={e} onAddTask={() => addPrepTask(e)} onEdit={() => openEvent(e)} busy={creatingPrep === e.id} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      <EventDialog open={dialogOpen} onOpenChange={setDialogOpen} event={editingEvent} onChanged={load} />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Clock className="size-5" />
      </span>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function EventRow({
  e,
  onAddTask,
  onEdit,
  busy,
}: {
  e: CalendarEventDTO;
  onAddTask?: () => void;
  onEdit?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="group flex items-start gap-3 px-4 py-3">
      <div className="flex w-16 shrink-0 items-center gap-1 pt-0.5 text-xs tabular-nums text-muted-foreground">
        <Clock className="h-3.5 w-3.5 text-primary" />
        {e.allDay ? "All day" : format(new Date(e.start), "h:mm a")}
      </div>
      <div className="min-w-0 flex-1">
        {onEdit ? (
          <button type="button" onClick={onEdit} className="text-left text-sm font-medium text-foreground hover:text-primary hover:underline">
            {e.title}
          </button>
        ) : (
          <p className="text-sm font-medium text-foreground">{e.title}</p>
        )}
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
      {onAddTask ? (
        <button
          type="button"
          onClick={onAddTask}
          disabled={busy}
          title="Create a prep task for this meeting"
          className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground opacity-0 transition-all hover:border-primary hover:text-primary focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
          Task
        </button>
      ) : null}
    </div>
  );
}
