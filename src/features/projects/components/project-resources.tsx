"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PROJECT_LINK_TYPES,
  PROJECT_LINK_TYPE_LABELS,
  type ProjectFeedbackItem,
  type ProjectLinkItem,
} from "../service";
import {
  addProjectFeedback,
  addProjectLink,
  deleteProjectFeedback,
  deleteProjectLink,
} from "../actions";

// ── Links ────────────────────────────────────────────────────
export function ProjectLinks({ projectId, links }: { projectId: string; links: ProjectLinkItem[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ label: "", url: "", type: "release", username: "", secret: "", notes: "" });

  function reset() {
    setForm({ label: "", url: "", type: "release", username: "", secret: "", notes: "" });
    setAdding(false);
  }

  function submit() {
    startTransition(async () => {
      const result = await addProjectLink({ projectId, ...form });
      if (result.ok) {
        toast.success("Link added.");
        reset();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteProjectLink(id);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      {links.length === 0 && !adding ? (
        <p className="px-2 text-xs text-muted-foreground">No links yet — releases, dashboards, servers, repos.</p>
      ) : null}

      {links.map((link) => {
        // Only allow http(s); prefix bare domains, neutralize javascript:/data: schemes.
        const safeHref = /^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`;
        return (
        <div key={link.id} className="group/link rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="shrink-0 capitalize">
              {PROJECT_LINK_TYPE_LABELS[link.type]}
            </Badge>
            <a
              href={safeHref}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 flex-1 items-center gap-1 truncate font-medium hover:text-primary"
            >
              {link.label}
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </a>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => remove(link.id)}
              disabled={pending}
              aria-label="Delete link"
              className="shrink-0 opacity-0 group-hover/link:opacity-100"
            >
              <Trash2 />
            </Button>
          </div>
          {link.username || link.secret || link.notes ? (
            <div className="mt-1 space-y-0.5 pl-1 text-xs text-muted-foreground">
              {link.username ? <div>user: <span className="font-mono text-foreground">{link.username}</span></div> : null}
              {link.secret ? <div>secret: <span className="font-mono text-foreground">{link.secret}</span></div> : null}
              {link.notes ? <div>{link.notes}</div> : null}
            </div>
          ) : null}
        </div>
        );
      })}

      {adding ? (
        <div className="space-y-2 rounded-md border border-border/60 p-2">
          <div className="flex gap-2">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="rounded-md border border-border bg-card px-2 text-sm"
            >
              {PROJECT_LINK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROJECT_LINK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <Input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <Input placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <div className="flex gap-2">
            <Input placeholder="Username (optional)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <Input placeholder="Secret (optional)" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
          </div>
          <Input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={pending}>
              Add link
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add link
        </button>
      )}
    </div>
  );
}

// ── Feedback ─────────────────────────────────────────────────
export function ProjectFeedback({ projectId, feedback }: { projectId: string; feedback: ProjectFeedbackItem[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ message: "", from: "", release: "" });

  function reset() {
    setForm({ message: "", from: "", release: "" });
    setAdding(false);
  }

  function submit() {
    startTransition(async () => {
      const result = await addProjectFeedback({
        projectId,
        message: form.message,
        from: form.from,
        release: form.release || undefined,
      });
      if (result.ok) {
        toast.success("Feedback added.");
        reset();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteProjectFeedback(id);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      {feedback.length === 0 && !adding ? (
        <p className="px-2 text-xs text-muted-foreground">No client feedback logged yet.</p>
      ) : null}

      {feedback.map((f) => (
        <div key={f.id} className="group/fb rounded-md border border-border/60 px-2.5 py-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1">{f.message}</p>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => remove(f.id)}
              disabled={pending}
              aria-label="Delete feedback"
              className="shrink-0 opacity-0 group-hover/fb:opacity-100"
            >
              <Trash2 />
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {f.from ? <span>— {f.from}</span> : null}
            {f.release ? (
              <Badge variant="outline" className="text-[10px] font-normal">
                {f.release}
              </Badge>
            ) : null}
          </div>
        </div>
      ))}

      {adding ? (
        <div className="space-y-2 rounded-md border border-border/60 p-2">
          <Textarea placeholder="What did the client say?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <div className="flex gap-2">
            <Input placeholder="From (client)" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            <Input placeholder="Release / features (optional)" value={form.release} onChange={(e) => setForm({ ...form, release: e.target.value })} />
          </div>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={pending}>
              Add feedback
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add feedback
        </button>
      )}
    </div>
  );
}
