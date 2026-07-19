"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { deletePrComment, editPrComment, type CommentKind } from "./actions";

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
        <div className={htmlBox} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      )}
    </div>
  );
}
