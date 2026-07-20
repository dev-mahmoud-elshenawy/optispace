"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Server } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { clearAdoConfig, saveAdoConfig, syncAzureDevOps, type AdoConfigView } from "./actions";

export function AzureDevOpsConfigPanel({
  config,
  stats,
}: {
  config: AdoConfigView;
  stats?: { count: number; latest: string | null };
}) {
  const router = useRouter();
  const [orgUrl, setOrgUrl] = useState(config.orgUrl);
  const [pat, setPat] = useState("");
  const [email, setEmail] = useState(config.email);
  const [projects, setProjects] = useState(config.projects || "all");
  const [includeDone, setIncludeDone] = useState(config.includeDone);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    const res = await syncAzureDevOps();
    setSyncing(false);
    if (!res.ok) {
      toast.error(res.error || "Azure DevOps sync failed.");
      return;
    }
    toast.success(`Synced: ${res.imported} imported, ${res.updated} updated, ${res.pruned} removed.`);
    router.refresh();
  }

  async function save() {
    setBusy(true);
    const res = await saveAdoConfig({ orgUrl, pat, email, projects, includeDone });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setPat("");
    toast.success("Azure DevOps settings saved.");
    router.refresh();
  }

  async function disconnect() {
    setBusy(true);
    await clearAdoConfig();
    setBusy(false);
    setOrgUrl("");
    setPat("");
    setEmail("");
    setProjects("all");
    setIncludeDone(false);
    toast.success("Azure DevOps disconnected.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="size-4" />
          Azure DevOps
          {config.configured ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Connected
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>
          Sync work items assigned to you into Tasks (auto-syncs while the app is open). Everything is stored
          on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config.configured && stats ? (
          <p className="text-xs text-muted-foreground">
            {stats.count} task{stats.count === 1 ? "" : "s"} synced{stats.latest ? ` · updated ${stats.latest}` : ""}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ado-org">Organization URL</Label>
            <Input
              id="ado-org"
              value={orgUrl}
              onChange={(e) => setOrgUrl(e.target.value)}
              placeholder="https://dev.azure.com/your-org"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ado-pat">Personal Access Token</Label>
            <Input
              id="ado-pat"
              type="password"
              autoComplete="off"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder={config.patSet ? "•••••••• (leave blank to keep current)" : "Paste your PAT"}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Needs <span className="font-medium">Work Items (Read, write &amp; manage)</span>. Stored locally in this
              device&rsquo;s database.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ado-email">Your email (optional)</Label>
            <Input
              id="ado-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ado-projects">Projects</Label>
            <Input
              id="ado-projects"
              value={projects}
              onChange={(e) => setProjects(e.target.value)}
              placeholder="all — or Project A, Project B"
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={includeDone} onCheckedChange={(v) => setIncludeDone(v === true)} />
            Include completed / closed work items
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy || syncing}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
          {config.configured ? (
            <>
              <Button variant="outline" onClick={sync} disabled={busy || syncing}>
                <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                Sync now
              </Button>
              <Button variant="outline" onClick={disconnect} disabled={busy || syncing}>
                Disconnect
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
