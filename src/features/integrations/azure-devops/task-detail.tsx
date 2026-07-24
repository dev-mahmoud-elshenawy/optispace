"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileText, GitBranch, History, Loader2, Paperclip, Save, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addAzureDevOpsComment,
  getAzureDevOpsTaskDetail,
  getAzureDevOpsWorkItemUpdates,
  searchAzureDevOpsIdentities,
  updateAzureDevOpsWorkItem,
  type WorkItemPatch,
} from "@/features/integrations/azure-devops/actions";
import type { WorkItemDetail, WorkItemUpdateView } from "@/features/integrations/azure-devops/service";
import { workItemStateColor, workItemTypeColor, type AdoIdentity } from "@/features/integrations/azure-devops/types";
import { MentionInput } from "@/features/integrations/azure-devops/mention-input";

interface AzureDevOpsTaskDetailProps {
  externalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Slim mode for drag-to-move: render only the ADO state picker + Save.
  statusOnly?: boolean;
}

const htmlBox = "max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_img]:rounded";
// 12-hour (AM/PM) date+time for all timestamps in this modal.
const DATETIME_FMT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", hour12: true };
const PRIORITIES = ["1", "2", "3", "4"];
// ADO priority is numeric (1 = highest … 4 = lowest); show a readable label but
// keep the number as the stored value so write-back to ADO is unchanged.
const PRIORITY_LABELS: Record<string, string> = {
  "1": "1 · Highest",
  "2": "2 · High",
  "3": "3 · Medium",
  "4": "4 · Low",
};

// Deterministic per-name avatar tint (mirrors the GitHub PR reviewers styling).
const AVATAR_COLORS = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Work-item history is a slow ADO getUpdates round-trip that never changes for a given
// revision — cache per externalId so reopening the same item shows history instantly.
const historyCache = new Map<string, WorkItemUpdateView[]>();

// Editable form values, seeded from the fetched work item.
interface Form {
  title: string;
  state: string;
  assignedTo: string;
  iterationPath: string;
  priority: string;
  effort: string;
  originalEstimate: string;
  remainingWork: string;
  completedWork: string;
  description: string;
}

function toForm(d: WorkItemDetail): Form {
  return {
    title: d.title,
    state: d.state,
    assignedTo: d.assignedTo,
    iterationPath: d.iterationPath,
    priority: d.priority,
    effort: d.effort,
    originalEstimate: d.originalEstimate,
    remainingWork: d.remainingWork,
    completedWork: d.completedWork,
    description: d.descriptionRaw,
  };
}

export function AzureDevOpsTaskDetail({ externalId, open, onOpenChange, statusOnly = false }: AzureDevOpsTaskDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [comment, setComment] = useState("");
  const [commentKey, setCommentKey] = useState(0); // bump to remount/clear the comment editor after posting
  const [currentId, setCurrentId] = useState(externalId); // in-modal navigation target — linked items load here
  // Assignee people-picker: `assigneeQuery` drives both the input text and the
  // identity search; `assigneePicked` starts true (seeded value is already a person)
  // so the dropdown only opens once the user starts typing a new name.
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeResults, setAssigneeResults] = useState<AdoIdentity[]>([]);
  const [searchingAssignee, setSearchingAssignee] = useState(false);
  const [assigneePicked, setAssigneePicked] = useState(true);
  // Work item history (lazy — fetched only when the History section is first expanded).
  const [updates, setUpdates] = useState<WorkItemUpdateView[] | null>(null);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  // Guards against a slow, superseded fetch overwriting a newer one's result. The
  // resync-then-fetch effects below run a render apart, so closing and reopening
  // with a different item can fire two overlapping loads (stale id, then correct
  // id) — without this, whichever resolves LAST wins, which briefly showed the
  // previous item's data even after the correct one had already loaded.
  const requestIdRef = useRef(0);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setDetail(null);
      setForm(null);
      setError(null);
    }
  }

  async function load(id: string) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const result = await getAzureDevOpsTaskDetail(id);
    if (requestIdRef.current !== requestId) return; // superseded by a newer load() — ignore this stale response
    if (result.ok) {
      setDetail(result.detail);
      setForm(toForm(result.detail));
      setAssigneeQuery(result.detail.assignedTo ?? "");
      setAssigneePicked(true); // seeded value is already the current person — don't auto-open the dropdown
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (open) setCurrentId(externalId); // reset to the opened item on (re)open
  }, [open, externalId]);

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setForm(null);
    setUpdates(historyCache.get(currentId) ?? null); // instant if cached, else lazy-load on tab open
    void load(currentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentId]);

  async function loadHistory() {
    if (updates !== null || loadingUpdates) return; // already loaded / loading
    setLoadingUpdates(true);
    try {
      const rows = await getAzureDevOpsWorkItemUpdates(currentId);
      historyCache.set(currentId, rows);
      setUpdates(rows);
    } catch {
      setUpdates([]);
    } finally {
      setLoadingUpdates(false);
    }
  }

  // Debounced identity search for the assignee picker. Same stale-response guard and
  // "searching" flag as the create dialog; only runs while the user is typing a new
  // name (assigneePicked === false), so a seeded value doesn't trigger a search.
  useEffect(() => {
    const q = assigneeQuery.trim();
    if (assigneePicked || q.length < 2) {
      setAssigneeResults([]);
      setSearchingAssignee(false);
      return;
    }
    let cancelled = false;
    setSearchingAssignee(true);
    const t = setTimeout(() => {
      searchAzureDevOpsIdentities(q)
        .then((r) => {
          if (!cancelled) setAssigneeResults(r);
        })
        .catch(() => {
          if (!cancelled) setAssigneeResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchingAssignee(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [assigneeQuery, assigneePicked]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const base = detail ? toForm(detail) : null;
  const dirty = form !== null && base !== null && (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== base[k]);

  async function save() {
    if (!detail || !form || !base || !dirty) return;
    const patch: WorkItemPatch = {};
    const fieldMap: Record<keyof Form, keyof WorkItemPatch> = {
      title: "title",
      state: "state",
      assignedTo: "assignedTo",
      iterationPath: "iterationPath",
      priority: "priority",
      effort: "effort",
      originalEstimate: "originalEstimate",
      remainingWork: "remainingWork",
      completedWork: "completedWork",
      description: "description",
    };
    for (const key of Object.keys(form) as (keyof Form)[]) {
      if (form[key] !== base[key]) patch[fieldMap[key]] = form[key];
    }
    setSaving(true);
    const result = await updateAzureDevOpsWorkItem(currentId, detail.rev, patch, {
      project: detail.project,
      type: detail.type,
    });
    setSaving(false);
    if (result.ok) {
      toast.success("Saved to Azure DevOps.");
      // Refresh in place from what we just saved (+ the new rev) instead of re-fetching the
      // whole item (~6 sequential ADO calls) — makes Save near-instant. The /rev test still
      // guards concurrent edits, and the next open re-fetches the canonical server copy.
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              rev: result.rev ?? prev.rev,
              title: form.title,
              state: form.state,
              assignedTo: form.assignedTo,
              iterationPath: form.iterationPath,
              priority: form.priority,
              effort: form.effort,
              originalEstimate: form.originalEstimate,
              remainingWork: form.remainingWork,
              completedWork: form.completedWork,
              descriptionRaw: form.description,
              descriptionHtml: form.description || null,
            }
          : prev,
      );
      setUpdates(null); // history now stale — reload on next expand
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function submitComment() {
    // comment is HTML (may contain mention anchors) — check the plain text isn't empty.
    const text = comment.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!detail || text.length === 0) return;
    setSaving(true);
    const result = await addAzureDevOpsComment(currentId, detail.project, comment);
    setSaving(false);
    if (result.ok) {
      toast.success("Comment added to Azure DevOps.");
      setComment("");
      setCommentKey((k) => k + 1); // remount MentionInput so it clears
      await load(currentId); // refetch to show the new comment
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={`max-h-[90vh] overflow-y-auto ${statusOnly ? "sm:max-w-md" : "sm:max-w-4xl"}`}>
        <DialogHeader>
          <DialogTitle className="pr-6">
            {statusOnly ? `Change status · #${currentId}` : `Work item #${currentId}`}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading from Azure DevOps…
          </div>
        ) : null}
        {error ? <p className="py-6 text-sm text-destructive">{error}</p> : null}

        {detail && form ? (
          statusOnly ? (
            <div className="space-y-4 text-sm">
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select value={form.state} onValueChange={(v) => set("state", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {detail.allowedStates.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Some ADO process rules require Effort before a state transition (TF401320
                  "Rule Error for field Effort … Required"). Optional here — save() only patches
                  changed fields, so a blank value isn't sent and Effort-less types are unaffected. */}
              <div className="space-y-1.5">
                <Label htmlFor="wi-effort-slim">Effort</Label>
                <Input
                  id="wi-effort-slim"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.effort}
                  onChange={(e) => set("effort", e.target.value)}
                  placeholder="Set only if the new state requires it"
                />
              </div>
              <Button onClick={save} disabled={saving || !dirty} size="sm">
                <Save /> Save to Azure DevOps
              </Button>
            </div>
          ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: workItemTypeColor(detail.type) }} />
                {detail.type}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                <GitBranch className="size-3 shrink-0" />
                {detail.project}
              </span>
              {detail.details.map((d) => (
                <span key={d.label} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  <span className="font-medium text-foreground/70">{d.label}:</span> {d.value}
                </span>
              ))}
              <a
                href={detail.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open in Azure DevOps <ExternalLink className="size-3" />
              </a>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wi-title">Title</Label>
              <Input id="wi-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select value={form.state} onValueChange={(v) => set("state", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {detail.allowedStates.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Iteration / sprint</Label>
                <Select value={form.iterationPath} onValueChange={(v) => set("iterationPath", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {(detail.iterations.includes(form.iterationPath) || !form.iterationPath
                      ? detail.iterations
                      : [form.iterationPath, ...detail.iterations]
                    ).map((it) => (
                      <SelectItem key={it} value={it}>
                        {it}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-assignee">Assignee</Label>
                <div className="relative">
                  <Input
                    id="wi-assignee"
                    value={assigneeQuery}
                    onChange={(e) => {
                      setAssigneeQuery(e.target.value);
                      setAssigneePicked(false); // typing a new name — open search, defer write until a pick
                      set("assignedTo", e.target.value); // keep raw text writable too (e.g. a full email)
                    }}
                    placeholder="Type a name…"
                  />
                  {!assigneePicked && assigneeQuery.trim().length >= 2 ? (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                      {searchingAssignee ? (
                        <p className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" /> Searching people…
                        </p>
                      ) : assigneeResults.length === 0 ? (
                        <p className="px-3 py-1.5 text-xs text-muted-foreground">No people found</p>
                      ) : (
                        assigneeResults.map((id) => (
                          <button
                            key={id.id}
                            type="button"
                            onClick={() => {
                              set("assignedTo", id.mail);
                              setAssigneeQuery(id.displayName);
                              setAssigneePicked(true);
                              setAssigneeResults([]);
                            }}
                            className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-accent/60"
                          >
                            <span>{id.displayName}</span>
                            {id.mail ? <span className="text-xs text-muted-foreground">{id.mail}</span> : null}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABELS[p] ?? p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Effort (Hours) section — mirrors ADO's layout. Exact field names so the close-rule's
                required `Effort` field is unambiguous. Only *changed* fields are patched, so a field
                absent on this work-item type is never sent unless the user edits it. */}
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <p className="text-xs font-semibold text-primary">Effort (Hours)</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wi-oe">Original Estimate</Label>
                  <Input id="wi-oe" type="number" min="0" step="0.1" value={form.originalEstimate} onChange={(e) => set("originalEstimate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wi-rw">Remaining</Label>
                  <Input id="wi-rw" type="number" min="0" step="0.1" value={form.remainingWork} onChange={(e) => set("remainingWork", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wi-effort">Effort</Label>
                  <Input id="wi-effort" type="number" min="0" step="0.1" value={form.effort} onChange={(e) => set("effort", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <MentionInput
                key={detail.rev}
                initialHtml={detail.descriptionHtml ?? ""}
                onChange={(html) => set("description", html)}
                placeholder="Add a description… use @ to mention"
                className={`min-h-[120px] ${htmlBox}`}
              />
            </div>

            <Button onClick={save} disabled={saving || !dirty} size="sm">
              <Save /> Save to Azure DevOps
            </Button>

            {detail.attachments.length > 0 ? (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 font-medium">
                  <Paperclip className="size-4" /> Attachments ({detail.attachments.length})
                </h4>
                <div className="space-y-2">
                  {detail.attachments.map((a) => {
                    const src = `/api/devops/attachment?id=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}`;
                    return a.isImage ? (
                      <a key={a.id} href={src} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={a.name} className="max-h-64 rounded-lg border border-border" />
                      </a>
                    ) : (
                      <a
                        key={a.id}
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-accent/60"
                      >
                        <Paperclip className="size-4 text-muted-foreground" /> {a.name}
                      </a>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {detail.parent || detail.children.length > 0 ? (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 font-medium">
                  <GitBranch className="size-4" /> Linked items
                </h4>
                <div className="space-y-2">
                  {[...(detail.parent ? [detail.parent] : []), ...detail.children].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCurrentId(item.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left hover:bg-accent/60"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: workItemTypeColor(item.type) }}
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">#{item.id}</span>
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: workItemStateColor(item.state) }}
                        />
                        {item.state}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <Tabs
              defaultValue="comments"
              onValueChange={(v) => {
                if (v === "history") void loadHistory();
              }}
            >
              <TabsList>
                <TabsTrigger value="comments">
                  <FileText className="size-3.5" /> Comments ({detail.comments.length})
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History className="size-3.5" /> History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="comments" className="mt-4">
                {detail.comments.length > 0 ? (
                  <ul className="mb-3 space-y-3">
                    {detail.comments.map((c, i) => (
                      <li key={i} className="rounded-lg border border-border p-3">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{c.author}</span>
                          {c.date ? <span>{new Date(c.date).toLocaleString(undefined, DATETIME_FMT)}</span> : null}
                        </div>
                        <div className={htmlBox} dangerouslySetInnerHTML={{ __html: c.text }} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-3 text-muted-foreground">No comments.</p>
                )}
                <MentionInput
                  key={`comment-${commentKey}`}
                  onChange={setComment}
                  placeholder="Add a comment… use @ to mention"
                  className="min-h-[80px]"
                />
                <Button
                  onClick={submitComment}
                  disabled={saving || comment.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0}
                  size="sm"
                  className="mt-2"
                >
                  <Send /> Comment
                </Button>
              </TabsContent>

              <TabsContent value="history" className="mt-4 space-y-2">
                {loadingUpdates ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Loading history…
                  </p>
                ) : updates && updates.length > 0 ? (
                  <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
                    {updates.map((u) => (
                      <li key={u.rev} className="relative flex gap-3">
                        <span
                          className={`z-10 mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-4 ring-background ${avatarColor(u.by)}`}
                          title={u.by}
                        >
                          {(u.by?.[0] ?? "?").toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1 pb-0.5">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-medium text-foreground">{u.by}</span>
                            {u.date ? (
                              <span className="text-xs text-muted-foreground">{new Date(u.date).toLocaleString(undefined, DATETIME_FMT)}</span>
                            ) : null}
                          </div>
                          {u.changes.length > 0 ? (
                            <ul className="mt-1.5 space-y-1 text-xs">
                              {u.changes.map((c, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-1.5">
                                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">{c.field}</span>
                                  {c.from ? <span className="text-muted-foreground/70 line-through">{c.from}</span> : null}
                                  {c.from ? <span className="text-muted-foreground">→</span> : null}
                                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-foreground">{c.to || "—"}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {u.comment ? (
                            <p className="mt-2 whitespace-pre-wrap rounded-md border-l-2 border-primary/40 bg-muted/50 px-2.5 py-1.5 text-xs text-foreground/80">{u.comment}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-muted-foreground">No history.</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
