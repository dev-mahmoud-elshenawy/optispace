"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, SmilePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { deletePrComment, editPrComment, togglePrReaction, type CommentKind } from "./actions";
import { REACTIONS, REACTION_EMOJI, type ReactionGroup } from "./types";

const htmlBox =
  "max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_img]:rounded [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_code]:text-xs [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5";

interface EditableCommentProps {
  repo: string;
  kind: CommentKind; // issue (general PR comment) | review (inline)
  commentId: number | null; // REST databaseId; null → can't edit/delete
  author: string;
  bodyHtml: string; // sanitized (display)
  body: string; // raw markdown (editing)
  createdAt: string;
  viewerLogin: string; // to show edit/delete only on your own comment
  onChanged: () => void;
  label?: string; // optional context chip, e.g. "src/foo.ts:12"
  subjectId?: string | null; // comment node id → enables the reaction bar
  reactions?: ReactionGroup[];
}

export function EditableComment({
  repo,
  kind,
  commentId,
  author,
  bodyHtml,
  body,
  createdAt,
  viewerLogin,
  onChanged,
  label,
  subjectId,
  reactions,
}: EditableCommentProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [busy, setBusy] = useState(false);
  const canEdit = commentId != null && author === viewerLogin;

  async function save() {
    if (commentId == null) return;
    setBusy(true);
    const res = await editPrComment(repo, kind, commentId, draft);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEditing(false);
    toast.success("Comment updated.");
    onChanged();
  }

  async function remove() {
    if (commentId == null) return;
    setBusy(true);
    const res = await deletePrComment(repo, kind, commentId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Comment deleted.");
    onChanged();
  }

  return (
    <div className="rounded-md border border-border/60 p-2.5 text-foreground">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">{author}</span>
        {label ? <code className="rounded bg-muted px-1 text-muted-foreground">{label}</code> : null}
        <span className="text-muted-foreground">· {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</span>
        {canEdit && !editing ? (
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(body);
                setEditing(true);
              }}
              className="text-primary hover:underline"
            >
              Edit
            </button>
            <button type="button" onClick={remove} disabled={busy} className="text-destructive hover:underline disabled:opacity-50">
              Delete
            </button>
          </span>
        ) : null}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy || !draft.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={htmlBox} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          {subjectId ? <ReactionBar subjectId={subjectId} reactions={reactions ?? []} onChanged={onChanged} /> : null}
        </>
      )}
    </div>
  );
}

// GitHub-style reaction bar: existing reactions as toggle pills + a picker for the 8 types.
function ReactionBar({
  subjectId,
  reactions,
  onChanged,
}: {
  subjectId: string;
  reactions: ReactionGroup[];
  onChanged: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const byContent = new Map(reactions.map((r) => [r.content, r]));

  async function toggle(content: string) {
    if (busy) return;
    setBusy(true);
    const res = await togglePrReaction(subjectId, content, !byContent.get(content)?.viewerReacted);
    setBusy(false);
    setPicker(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onChanged();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.content}
          type="button"
          disabled={busy}
          onClick={() => toggle(r.content)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50",
            r.viewerReacted
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          <span className="leading-none">{REACTION_EMOJI[r.content] ?? "❓"}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPicker((v) => !v)}
          aria-label="Add reaction"
          className="inline-flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <SmilePlus className="size-3.5" />
        </button>
        {picker ? (
          <div className="absolute left-0 top-7 z-20 flex gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md">
            {REACTIONS.map((r) => (
              <button
                key={r.content}
                type="button"
                disabled={busy}
                onClick={() => toggle(r.content)}
                title={r.content.toLowerCase()}
                className={cn(
                  "rounded p-1 text-base leading-none transition-colors hover:bg-accent",
                  byContent.get(r.content)?.viewerReacted && "bg-primary/10",
                )}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
