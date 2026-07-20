"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, GitPullRequest, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  githubConnectToken,
  githubDeviceStart,
  githubDevicePoll,
  githubDisconnect,
  type GithubAuthStatus,
} from "./actions";

// Client ID isn't secret in device flow (no client secret involved), so we keep it on this
// device in localStorage — entered once in the app, never in .env. Once saved, connecting
// is a single click; a "Change" link reveals the field again if you need a different app.
const CLIENT_ID_KEY = "optispace:githubClientId";

interface DevicePrompt {
  userCode: string;
  verificationUri: string;
}

export function GithubConnectPanel({
  status,
  stats,
}: {
  status: GithubAuthStatus;
  stats?: { count: number; latest: string | null };
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  // Default to the entry field so a first-time user sees it immediately (no flicker). The
  // effect only ever collapses it to the one-click button when a saved ID is found.
  const [editing, setEditing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<DevicePrompt | null>(null);
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState(""); // paste-a-token path (bypasses OAuth-app approval)
  const [tokenBusy, setTokenBusy] = useState(false);
  const cancelled = useRef(false); // set on disconnect to stop an in-flight poll loop

  useEffect(() => {
    const saved = localStorage.getItem(CLIENT_ID_KEY) ?? "";
    if (saved.trim()) {
      setClientId(saved);
      setEditing(false);
    }
  }, []);

  // Poll github until the user authorizes the code, it expires, or they deny it.
  const pollUntilAuthorized = useCallback(
    async (deviceCode: string, id: string, intervalSec: number, expiresInSec: number) => {
      const deadline = Date.now() + expiresInSec * 1000;
      let wait = Math.max(intervalSec, 5) * 1000;
      while (Date.now() < deadline && !cancelled.current) {
        await new Promise((r) => setTimeout(r, wait));
        if (cancelled.current) return;
        const res = await githubDevicePoll(deviceCode, id);
        if (res.ok) {
          toast.success(res.login ? `Connected as ${res.login}.` : "GitHub connected.");
          setPrompt(null);
          setBusy(false);
          router.refresh();
          return;
        }
        if (!res.pending) {
          toast.error(res.error || "GitHub authorization failed.");
          setPrompt(null);
          setBusy(false);
          return;
        }
        // slow_down asks us to back off by 5s; keep pending otherwise.
        if (res.error === "slow_down") wait += 5000;
      }
      if (!cancelled.current) {
        toast.error("The code expired. Try connecting again.");
        setPrompt(null);
        setBusy(false);
      }
    },
    [router],
  );

  async function handleConnect() {
    const id = clientId.trim();
    if (!id) {
      toast.error("Enter your GitHub OAuth App Client ID first.");
      return;
    }
    localStorage.setItem(CLIENT_ID_KEY, id);
    setEditing(false);
    cancelled.current = false;
    setBusy(true);
    const start = await githubDeviceStart(id);
    if (!start.ok) {
      toast.error(start.error);
      setBusy(false);
      return;
    }
    setPrompt({ userCode: start.userCode, verificationUri: start.verificationUri });
    window.open(start.verificationUri, "_blank", "noopener");
    void pollUntilAuthorized(start.deviceCode, id, start.interval, start.expiresIn);
  }

  async function handleDisconnect() {
    cancelled.current = true;
    await githubDisconnect();
    setPrompt(null);
    setBusy(false);
    toast.success("GitHub disconnected.");
    router.refresh();
  }

  async function handleConnectToken() {
    const t = token.trim();
    if (!t) {
      toast.error("Paste a GitHub token first.");
      return;
    }
    setTokenBusy(true);
    const res = await githubConnectToken(t);
    setTokenBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setToken("");
    toast.success(res.login ? `Connected as ${res.login}.` : "GitHub connected.");
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
          <GitPullRequest className="size-4" />
          GitHub
          {status.connected ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Connected
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>
          {status.connected
            ? `Connected${status.login ? ` as ${status.login}` : ""} — surfaces your pull requests (auto-syncs while the app is open).`
            : "Sync the pull requests you authored, were asked to review, or are assigned to."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.connected ? (
          <div className="space-y-3">
            {stats ? (
              <p className="text-xs text-muted-foreground">
                {stats.count} pull request{stats.count === 1 ? "" : "s"}
                {stats.latest ? ` · updated ${stats.latest}` : ""}
              </p>
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
        ) : (
          <>
          {editing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="github-client-id">OAuth App Client ID</Label>
              <Input
                id="github-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Iv23li..."
                className="max-w-xs font-mono"
              />
              <p className="text-xs text-muted-foreground">
                One-time — not a secret, saved on this device only. Reused every time you connect.
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
                    href="https://github.com/settings/developers"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    GitHub → Developer settings → OAuth Apps
                    <ExternalLink className="size-3" />
                  </a>
                </li>
                <li>
                  Click <span className="font-medium">New OAuth App</span>. Any name works; the
                  <span className="font-medium"> Homepage URL</span> and <span className="font-medium">Authorization callback URL</span> can be
                  any valid URL (device flow ignores the callback).
                </li>
                <li>
                  Tick <span className="font-medium">Enable Device Flow</span>, then <span className="font-medium">Register application</span>.
                </li>
                <li>
                  Copy the <span className="font-medium">Client ID</span> and paste it above.
                </li>
              </ol>
            </details>
            <Button onClick={handleConnect} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <GitPullRequest className="size-4" />}
              Connect GitHub
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button onClick={handleConnect} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <GitPullRequest className="size-4" />}
              Connect GitHub
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
          <div className="space-y-2 border-t border-border/60 pt-4">
            <Label htmlFor="github-token">Or paste a token (no admin approval needed)</Label>
            <div className="flex max-w-md gap-2">
              <Input
                id="github-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="gho_… or ghp_…"
                className="font-mono"
              />
              <Button variant="outline" onClick={handleConnectToken} disabled={tokenBusy}>
                {tokenBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                Connect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              If your org blocks the OAuth app, run <code className="rounded bg-muted px-1">gh auth token</code> (GitHub
              CLI) and paste it here, or use a classic PAT with <code className="rounded bg-muted px-1">repo</code> scope.
              Stored on this device only.
            </p>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
