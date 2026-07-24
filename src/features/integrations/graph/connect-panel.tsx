"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check, Copy, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { graphConnectStart, graphConnectPoll, graphDisconnect, type GraphAuthStatus } from "./actions";

// Public-client device flow: the Client ID is not a secret, so it lives on this device in
// localStorage (entered once). It's also persisted server-side on connect so the background
// poller can refresh the token without the browser.
const CLIENT_ID_KEY = "optispace:graphClientId";

interface DevicePrompt {
  userCode: string;
  verificationUri: string;
}

export function GraphConnectPanel({
  status,
  stats,
}: {
  status: GraphAuthStatus;
  stats?: { count: number; latest: string | null; lastError: string | null };
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [editing, setEditing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<DevicePrompt | null>(null);
  const [copied, setCopied] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(CLIENT_ID_KEY) ?? "";
    if (saved.trim()) {
      setClientId(saved);
      setEditing(false);
    }
  }, []);

  const pollUntilAuthorized = useCallback(async () => {
    const deadline = Date.now() + 15 * 60 * 1000; // device codes live ~15 min
    while (Date.now() < deadline && !cancelled.current) {
      await new Promise((r) => setTimeout(r, 5000));
      if (cancelled.current) return;
      const res = await graphConnectPoll();
      if (res.status === "done") {
        toast.success("Microsoft calendar connected.");
        setPrompt(null);
        setBusy(false);
        router.refresh();
        return;
      }
      if (res.status === "error") {
        toast.error(res.error || "Microsoft authorization failed.");
        setPrompt(null);
        setBusy(false);
        return;
      }
    }
    if (!cancelled.current) {
      toast.error("The code expired. Try connecting again.");
      setPrompt(null);
      setBusy(false);
    }
  }, [router]);

  async function handleConnect() {
    const id = clientId.trim();
    if (!id) {
      toast.error("Enter your Microsoft Entra app Client ID first.");
      return;
    }
    localStorage.setItem(CLIENT_ID_KEY, id);
    setEditing(false);
    cancelled.current = false;
    setBusy(true);
    const start = await graphConnectStart(id);
    if (!start.ok) {
      toast.error(start.error);
      setBusy(false);
      return;
    }
    setPrompt({ userCode: start.userCode, verificationUri: start.verificationUri });
    window.open(start.verificationUri, "_blank", "noopener");
    void pollUntilAuthorized();
  }

  async function handleDisconnect() {
    cancelled.current = true;
    await graphDisconnect();
    setPrompt(null);
    setBusy(false);
    toast.success("Microsoft calendar disconnected.");
    router.refresh();
  }

  async function copyCode() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt.userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" />
          Microsoft Calendar (Graph)
          {status.connected ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Connected
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>
          {status.connected
            ? `Connected${status.account ? ` as ${status.account}` : ""} — reads and edits your Outlook calendar (auto-syncs while the app is open).`
            : "Connect your Microsoft/Outlook calendar to read full details (attendees, join links) and create, edit, or RSVP to events. Takes over from the ICS feed when connected."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.connected ? (
          <div className="space-y-3">
            {stats ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {stats.count} event{stats.count === 1 ? "" : "s"}
                  {stats.latest ? ` · last synced ${stats.latest}` : ""}
                </p>
                {stats.lastError ? <p className="text-xs text-destructive">⚠ Last sync failed: {stats.lastError}</p> : null}
              </>
            ) : null}
            <Button variant="outline" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        ) : prompt ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter this code at{" "}
              <a
                href={prompt.verificationUri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {prompt.verificationUri.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3" />
              </a>
            </p>
            <div className="flex items-center gap-2">
              <code className="rounded-md border border-border bg-muted px-3 py-1.5 font-mono text-lg tracking-widest">
                {prompt.userCode}
              </code>
              <Button variant="ghost" size="sm" onClick={copyCode}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Waiting for you to authorize…
            </p>
          </div>
        ) : editing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="graph-client-id">Entra app Client ID</Label>
              <Input
                id="graph-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="max-w-md font-mono"
              />
              <p className="text-xs text-muted-foreground">
                One-time — not a secret (public client), saved on this device and used to refresh the token.
              </p>
            </div>
            <details className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                Where do I get a Client ID?
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
                <li>
                  Open{" "}
                  <a
                    href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Microsoft Entra → App registrations
                    <ExternalLink className="size-3" />
                  </a>
                </li>
                <li>
                  <span className="font-medium">New registration</span>. Any name; supported account types
                  = <span className="font-medium">Any Entra ID Tenant + Personal Microsoft accounts</span> (this
                  matches the app&rsquo;s <code className="rounded bg-muted px-1">common</code> sign-in — not
                  &ldquo;Single tenant&rdquo;). No redirect URI needed.
                </li>
                <li>
                  In <span className="font-medium">Authentication</span> → Advanced settings, set{" "}
                  <span className="font-medium">Allow public client flows</span> = <span className="font-medium">Yes</span>.
                </li>
                <li>
                  In <span className="font-medium">API permissions</span>, add delegated Microsoft Graph scopes{" "}
                  <code className="rounded bg-muted px-1">Calendars.ReadWrite</code>,{" "}
                  <code className="rounded bg-muted px-1">offline_access</code>,{" "}
                  <code className="rounded bg-muted px-1">User.Read</code>,{" "}
                  <code className="rounded bg-muted px-1">People.Read</code> (the last powers the attendee
                  picker). All are user-consented — no admin approval.
                </li>
                <li>
                  Copy the <span className="font-medium">Application (client) ID</span> from Overview and paste it above.
                </li>
              </ol>
            </details>
            <Button onClick={handleConnect} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
              Connect Microsoft
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button onClick={handleConnect} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
              Connect Microsoft
            </Button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="block text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Change Client ID
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
