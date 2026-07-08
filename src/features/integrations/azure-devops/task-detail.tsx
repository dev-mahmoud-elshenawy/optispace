"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileText, Loader2, Paperclip, Save, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addAzureDevOpsComment,
  getAzureDevOpsTaskDetail,
  updateAzureDevOpsWorkItem,
  type WorkItemPatch,
} from "@/features/integrations/azure-devops/actions";
import type { WorkItemDetail } from "@/features/integrations/azure-devops/service";

interface AzureDevOpsTaskDetailProps {
  externalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const htmlBox = "max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_img]:rounded";
const PRIORITIES = ["1", "2", "3", "4"];

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

export function AzureDevOpsTaskDetail({ externalId, open, onOpenChange }: AzureDevOpsTaskDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [comment, setComment] = useState("");
  const descRef = useRef<HTMLDivElement>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setDetail(null);
      setForm(null);
      setError(null);
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    const result = await getAzureDevOpsTaskDetail(externalId);
    if (result.ok) {
      setDetail(result.detail);
      setForm(toForm(result.detail));
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setForm(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, externalId]);

  // Seed the contentEditable with the rendered HTML when the item (re)loads.
  useEffect(() => {
    if (descRef.current) descRef.current.innerHTML = detail?.descriptionHtml ?? "";
  }, [detail]);

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
    const result = await updateAzureDevOpsWorkItem(externalId, detail.rev, patch, {
      project: detail.project,
      type: detail.type,
    });
    setSaving(false);
    if (result.ok) {
      toast.success("Saved to Azure DevOps.");
      await load(); // refetch fresh rev + values
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function submitComment() {
    if (!detail || !comment.trim()) return;
    setSaving(true);
    const result = await addAzureDevOpsComment(externalId, detail.project, comment);
    setSaving(false);
    if (result.ok) {
      toast.success("Comment added to Azure DevOps.");
      setComment("");
      await load(); // refetch to show the new comment
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">Work item #{externalId}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading from Azure DevOps…
          </div>
        ) : null}
        {error ? <p className="py-6 text-sm text-destructive">{error}</p> : null}

        {detail && form ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{detail.type}</span>
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
                <Label htmlFor="wi-assignee">Assignee (email)</Label>
                <Input id="wi-assignee" value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} placeholder="name@company.com" />
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
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wi-effort">Estimated effort</Label>
                <Input id="wi-effort" type="number" min="0" step="0.1" value={form.effort} onChange={(e) => set("effort", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-cw">Actual effort</Label>
                <Input id="wi-cw" type="number" min="0" step="0.1" value={form.completedWork} onChange={(e) => set("completedWork", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <div
                ref={descRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => set("description", e.currentTarget.innerHTML)}
                className={`min-h-[120px] rounded-lg border border-border p-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${htmlBox}`}
              />
            </div>

            <Button onClick={save} disabled={saving || !dirty} size="sm">
              <Save /> Save to Azure DevOps
            </Button>

            {detail.details.length > 0 ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border p-3">
                {detail.details.map((d) => (
                  <div key={d.label} className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">{d.label}</dt>
                    <dd className="truncate">{d.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

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

            <section>
              <h4 className="mb-2 flex items-center gap-1.5 font-medium">
                <FileText className="size-4" /> Comments ({detail.comments.length})
              </h4>
              {detail.comments.length > 0 ? (
                <ul className="mb-3 space-y-3">
                  {detail.comments.map((c, i) => (
                    <li key={i} className="rounded-lg border border-border p-3">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{c.author}</span>
                        {c.date ? <span>{new Date(c.date).toLocaleString()}</span> : null}
                      </div>
                      <div className={htmlBox} dangerouslySetInnerHTML={{ __html: c.text }} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-muted-foreground">No comments.</p>
              )}
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" rows={3} />
              <Button onClick={submitComment} disabled={saving || comment.trim().length === 0} size="sm" className="mt-2">
                <Send /> Comment
              </Button>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
