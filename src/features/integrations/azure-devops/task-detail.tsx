"use client";

import { useState } from "react";
import { ExternalLink, FileText, Info, Loader2, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAzureDevOpsTaskDetail } from "@/features/integrations/azure-devops/actions";
import type { WorkItemDetail } from "@/features/integrations/azure-devops/service";

interface AzureDevOpsTaskDetailProps {
  externalId: string;
  title: string;
}

const htmlBox = "max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_img]:rounded";

export function AzureDevOpsTaskDetail({ externalId, title }: AzureDevOpsTaskDetailProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setError(null);
      const result = await getAzureDevOpsTaskDetail(externalId);
      if (result.ok) setDetail(result.detail);
      else setError(result.error);
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void handleOpenChange(true);
        }}
        aria-label="View Azure DevOps details"
      >
        <Info />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-6">{title}</DialogTitle>
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
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">{detail.state}</span>
                <a
                  href={detail.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open in Azure DevOps <ExternalLink className="size-3" />
                </a>
              </div>

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
                {detail.comments.length === 0 ? (
                  <p className="text-muted-foreground">No comments.</p>
                ) : (
                  <ul className="space-y-3">
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
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
