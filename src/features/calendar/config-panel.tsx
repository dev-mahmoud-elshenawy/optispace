"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { clearCalendarConfig, saveCalendarConfig, type CalendarConfigView } from "./actions";

export function CalendarConfigPanel({
  config,
  stats,
}: {
  config: CalendarConfigView;
  stats?: { count: number; latest: string | null };
}) {
  const router = useRouter();
  const [icsUrl, setIcsUrl] = useState(config.icsUrl);
  const [reminderMinutes, setReminderMinutes] = useState(String(config.reminderMinutes));
  const [busy, setBusy] = useState(false);
  const connected = config.icsUrl.trim().length > 0;

  async function save() {
    setBusy(true);
    const res = await saveCalendarConfig({ icsUrl, reminderMinutes: Number(reminderMinutes) || 15 });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Calendar settings saved.");
    router.refresh();
  }

  async function disconnect() {
    setBusy(true);
    await clearCalendarConfig();
    setBusy(false);
    setIcsUrl("");
    setReminderMinutes("15");
    toast.success("Calendar disconnected.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4" />
          Calendar
          {connected ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Connected
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>
          Show meetings from a published ICS feed. In Outlook: Settings → Calendar → Shared calendars →
          Publish a calendar → copy the ICS link. Stored on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected && stats ? (
          <p className="text-xs text-muted-foreground">
            {stats.count} event{stats.count === 1 ? "" : "s"} cached{stats.latest ? ` · updated ${stats.latest}` : ""}
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="cal-ics">ICS feed URL</Label>
          <Input
            id="cal-ics"
            value={icsUrl}
            onChange={(e) => setIcsUrl(e.target.value)}
            placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cal-reminder">Reminder (minutes before a meeting)</Label>
          <Input
            id="cal-reminder"
            type="number"
            min={1}
            value={reminderMinutes}
            onChange={(e) => setReminderMinutes(e.target.value)}
            className="max-w-[8rem]"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
          {connected ? (
            <Button variant="outline" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
