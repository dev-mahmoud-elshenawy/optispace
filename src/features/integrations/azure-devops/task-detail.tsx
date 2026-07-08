"use client";

import { useState } from "react";
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
} from "@/features/integrations/azure-devops/actions";
import type { WorkItemDetail } from "@/features/integrations/azure-devops/service";

interface AzureDevOpsTaskDetailProps {
  externalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const htmlBox = "max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_img]:rounded";

export function AzureDevOpsTaskDetail({ externalId, open, onOpenChange }: AzureDevOpsTaskDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [state, setState] = useState("");
  const [comment, setComment] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    const result = await getAzureDevOpsTaskDetail(externalId);
    if (result.ok) {
      setDetail(result.detail);
      setTitle(result.detail.title);
      setState(result.detail.state);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      setDetail(null);
      void load(); // refetch each open → fresh rev for concurrency
    }
  }

  const dirty = detail !== null && (title !== detail.title || state !== detail.state);

  async function save() {
    if (!detail || !dirty) return;
    setSaving(true);
    const result = await updateAzureDevOpsWorkItem(
      externalId,
      detail.rev,
      { title: title !== detail.title ? title : undefined, state: state !== detail.state ? state : undefined },
      { project: detail.project, type: detail.type },
    );
    setSaving(false);
    if (result.ok) {
      toast.success("Saved to Azure DevOps.");
      await load();
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
      await load();
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

        {detail ? (
          <div className="space-y-5 text-sm">
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

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="wi-title">Title</Label>
                <Input id="wi-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger className="w-full sm:w-44">
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
            </div>

            {dirty ? (
              <Button onClick={save} disabled={saving} size="sm">
                <Save /> Save to Azure DevOps
              </Button>
            ) : null}

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

            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 font-medium">
                <FileText className="size-4" /> Description
              </h4>
              {detail.descriptionHtml ? (
                <div className={`rounded-lg border border-border p-3 ${htmlBox}`} dangerouslySetInnerHTML={{ __html: detail.descriptionHtml }} />
              ) : (
                <p className="text-muted-foreground">No description.</p>
              )}
            </section>

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
              <h4 className="mb-2 font-medium">Comments ({detail.comments.length})</h4>
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
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment…"
                rows={3}
              />
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
