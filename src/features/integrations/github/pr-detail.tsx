"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Check,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestDraft,
  Loader2,
  MessageSquare,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { addPrComment, closePr, getPullRequestDetail, mergePr } from "./actions";
import { MentionTextarea } from "./mention-textarea";
import { EditableComment } from "./pr-comment";
import { PrCode } from "./pr-code";
import { PrTimeline } from "./pr-timeline";
import { CHECKS_BADGE, REVIEW_BADGE, type PullRequestDetail, type PullRequestReview } from "./types";

// Rendered PR/comment HTML is sanitized server-side (shared ADO allowlist) before it gets here.
const htmlBox =
  "max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_img]:rounded [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_code]:text-xs [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5";

// Short-lived detail cache — reopening a PR shows instantly, then revalidates in the background.
const detailCache = new Map<string, PullRequestDetail>();
const cacheKey = (nodeId: string | null, repo: string, number: number) => `${nodeId ?? ""}|${repo}#${number}`;

// Deterministic avatar tint per person — a name always maps to the same colour so people are
// recognisable at a glance across reviews/comments.
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

function InitialAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        avatarColor(name || "?"),
        className,
      )}
      title={name}
    >
      {(name?.[0] ?? "?").toUpperCase()}
    </span>
  );
}

// Latest meaningful review per reviewer. A trailing COMMENTED never downgrades an
// APPROVED / CHANGES_REQUESTED decision (matches GitHub's "review state" semantics).
function reviewerSummary(reviews: PullRequestReview[]): [string, string][] {
  const map = new Map<string, string>();
  for (const r of reviews) {
    const prev = map.get(r.author);
    if (r.state === "COMMENTED" && prev && prev !== "COMMENTED") continue;
    map.set(r.author, r.state);
  }
  return [...map.entries()];
}

function reviewMark(state: string) {
  if (state === "APPROVED") return { Icon: Check, cls: "text-emerald-500", label: "approved" };
  if (state === "CHANGES_REQUESTED") return { Icon: X, cls: "text-destructive", label: "changes requested" };
  return { Icon: MessageSquare, cls: "text-muted-foreground", label: "commented" };
}

function stateMeta(detail: PullRequestDetail) {
  if (detail.merged) {
    return { label: "Merged", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-300", Icon: GitMerge };
  }
  if (detail.state === "closed") return { label: "Closed", cls: "bg-destructive/15 text-destructive", Icon: X };
  if (detail.draft) return { label: "Draft", cls: "bg-muted text-muted-foreground", Icon: GitPullRequestDraft };
  return { label: "Open", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", Icon: GitPullRequest };
}

interface Props {
  nodeId: string | null;
  repo: string;
  number: number;
  title: string; // fallback header shown while the detail loads
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GithubPrDetail({ nodeId, repo, number, title, open, onOpenChange }: Props) {
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<"squash" | "merge" | "rebase">("squash");
  const [prBusy, setPrBusy] = useState<null | string>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const key = cacheKey(nodeId, repo, number);
    const cached = detailCache.get(key);
    if (cached) {
      // Show the cached copy instantly, revalidate silently below.
      setDetail(cached);
      setLoading(false);
    } else {
      setDetail(null);
      setLoading(true);
    }
    setError(null);
    getPullRequestDetail(nodeId, repo, number).then((res) => {
      if (!active) return;
      if (res.ok) {
        detailCache.set(key, res.detail);
        setDetail(res.detail);
      } else if (!cached) {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, nodeId, repo, number]);

  // Silent refresh after a write (comment / review / merge) — swap in fresh data + update cache.
  const reload = useCallback(() => {
    const key = cacheKey(nodeId, repo, number);
    getPullRequestDetail(nodeId, repo, number).then((res) => {
      if (res.ok) {
        detailCache.set(key, res.detail);
        setDetail(res.detail);
      }
    });
  }, [nodeId, repo, number]);

  async function postComment() {
    if (!detail) return;
    setCommentBusy(true);
    const res = await addPrComment(detail.repo, detail.number, commentBody);
    setCommentBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setCommentBody("");
    toast.success("Comment posted.");
    reload();
  }

  async function doMerge() {
    if (!detail) return;
    setPrBusy("merge");
    const res = await mergePr(detail.repo, detail.number, mergeMethod);
    setPrBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pull request merged.");
    reload();
  }

  async function doClose() {
    if (!detail) return;
    setPrBusy("close");
    const res = await closePr(detail.repo, detail.number);
    setPrBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pull request closed.");
    reload();
  }

  const review = detail?.reviewDecision ? REVIEW_BADGE[detail.reviewDecision] : null;
  const checks = detail?.checksStatus ? CHECKS_BADGE[detail.checksStatus] : null;
  const state = detail ? stateMeta(detail) : null;
  const reviewers = detail ? reviewerSummary(detail.reviews) : [];
  const diffTotal = detail ? detail.additions + detail.deletions : 0;
  const reviewCommentCount = detail ? detail.reviewThreads.reduce((n, t) => n + t.comments.length, 0) : 0;
  const convos = detail ? detail.reviewThreads.filter((t) => t.comments.length > 0) : [];
  const unresolvedConvos = convos.filter((t) => !t.isResolved).length;
  const resolvedConvos = convos.length - unresolvedConvos;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[97vw] max-w-6xl flex-col overflow-hidden p-0 sm:max-w-6xl">
        {/* Hero header — identity at a glance across every tab */}
        <DialogHeader className="space-y-2 border-b bg-muted/30 px-6 pb-4 pt-5">
          <DialogTitle className="flex items-start gap-2.5 pr-6 text-left text-base">
            {state ? (
              <span
                className={cn(
                  "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  state.cls,
                )}
              >
                <state.Icon className="size-3.5" />
                {state.label}
              </span>
            ) : (
              <GitPullRequest className="mt-1 size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 leading-snug">
              {detail?.title ?? title} <span className="font-normal text-muted-foreground">#{number}</span>
            </span>
            {detail ? (
              <a
                href={detail.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto mr-2 inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-normal text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <ExternalLink className="size-3.5" /> GitHub
              </a>
            ) : null}
          </DialogTitle>
          {detail ? (
            <div className="flex flex-wrap items-center gap-1.5 pl-1 text-xs text-muted-foreground">
              <InitialAvatar name={detail.author} className="size-5" />
              <span className="font-medium text-foreground">{detail.author}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-medium text-foreground">{detail.repo}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>opened {formatDistanceToNow(new Date(detail.createdAt), { addSuffix: true })}</span>
            </div>
          ) : null}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <p className="px-6 py-6 text-sm text-destructive">{error}</p>
        ) : detail && state ? (
          <Tabs defaultValue="summary" className="flex min-h-0 flex-1 flex-col px-6 pb-4">
            <TabsList className="mt-3 self-start">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="code">Code · {detail.changedFiles}</TabsTrigger>
            </TabsList>

            {/* Summary — two-column: conversation on the left, status/actions rail on the right */}
            <TabsContent value="summary" className="mt-3 flex min-h-0 flex-1 flex-col">
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto pr-1 lg:grid-cols-[1fr_15rem]">
              {/* Rail (order-first on mobile so status/actions lead; right column on desktop) */}
              <aside className="order-1 space-y-3 lg:order-2 lg:self-start">
                <div className="space-y-2 rounded-lg border p-3">
                  <SectionLabel>Status</SectionLabel>
                  <div className="flex flex-col gap-1.5">
                    {review ? (
                      <Badge className={cn("w-fit gap-1 border-transparent font-normal", review.className)}>
                        {review.label}
                      </Badge>
                    ) : null}
                    {checks ? (
                      <Badge className={cn("w-fit gap-1 border-transparent font-normal", checks.className)}>
                        {checks.label}
                      </Badge>
                    ) : null}
                    {!review && !checks ? (
                      <span className="text-xs text-muted-foreground">No review or check status.</span>
                    ) : null}
                  </div>
                </div>

                {reviewers.length > 0 ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <SectionLabel>Reviewers</SectionLabel>
                    {reviewers.map(([name, st]) => {
                      const mark = reviewMark(st);
                      return (
                        <div key={name} className="flex items-center gap-2 text-sm">
                          <InitialAvatar name={name} />
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                          <mark.Icon className={cn("size-4 shrink-0", mark.cls)} />
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <SectionLabel>Branch</SectionLabel>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <GitBranch className="size-3.5 text-muted-foreground" />
                      <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono">{detail.headBranch}</code>
                      <ArrowRight className="size-3 text-muted-foreground" />
                      <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono">{detail.baseBranch}</code>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <SectionLabel>Changes</SectionLabel>
                    <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{detail.additions}</span>
                      <span className="font-semibold text-destructive">−{detail.deletions}</span>
                      <span className="text-muted-foreground">
                        · {detail.changedFiles} file{detail.changedFiles === 1 ? "" : "s"}
                      </span>
                    </div>
                    {diffTotal > 0 ? (
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${(detail.additions / diffTotal) * 100}%` }}
                        />
                        <div className="bg-destructive" style={{ width: `${(detail.deletions / diffTotal) * 100}%` }} />
                      </div>
                    ) : null}
                  </div>
                </div>

                {convos.length > 0 ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <SectionLabel>Conversations</SectionLabel>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Check className={cn("size-4", unresolvedConvos === 0 ? "text-emerald-500" : "text-muted-foreground")} />
                      <span className="tabular-nums">
                        {resolvedConvos}/{convos.length} resolved
                      </span>
                    </div>
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="bg-emerald-500" style={{ width: `${(resolvedConvos / convos.length) * 100}%` }} />
                    </div>
                  </div>
                ) : null}

                {detail.state === "open" && !detail.merged ? (
                  <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.03] p-3">
                    <SectionLabel>Actions</SectionLabel>
                    {unresolvedConvos > 0 ? (
                      <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <MessageSquare className="size-3.5" /> {unresolvedConvos} unresolved conversation
                        {unresolvedConvos === 1 ? "" : "s"}
                      </p>
                    ) : null}
                    <Select value={mergeMethod} onValueChange={(v) => setMergeMethod(v as "squash" | "merge" | "rebase")}>
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="squash">Squash &amp; merge</SelectItem>
                        <SelectItem value="merge">Merge commit</SelectItem>
                        <SelectItem value="rebase">Rebase &amp; merge</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="w-full" onClick={doMerge} disabled={prBusy !== null}>
                      {prBusy === "merge" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <GitMerge className="size-4" />
                      )}
                      Merge
                    </Button>
                    <Button size="sm" variant="outline" className="w-full" onClick={doClose} disabled={prBusy !== null}>
                      {prBusy === "close" ? <Loader2 className="size-4 animate-spin" /> : null}
                      Close
                    </Button>
                  </div>
                ) : null}
              </aside>

              {/* Conversation column */}
              <div className="order-2 min-w-0 space-y-4 lg:order-1">
                <section className="rounded-lg border">
                  <div className="border-b bg-muted/30 px-3 py-2">
                    <SectionLabel>Description</SectionLabel>
                  </div>
                  <div className="p-3.5">
                    {detail.bodyHtml ? (
                      <div className={htmlBox} dangerouslySetInnerHTML={{ __html: detail.bodyHtml }} />
                    ) : (
                      <p className="text-sm italic text-muted-foreground">No description.</p>
                    )}
                  </div>
                </section>

                {detail.reviews.length > 0 ? (
                  <section className="space-y-2">
                    <SectionLabel>Reviews</SectionLabel>
                    {detail.reviews.map((r, i) => {
                      const mark = reviewMark(r.state);
                      return (
                        <div key={i} className="rounded-lg border border-border/60 p-3">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                            <InitialAvatar name={r.author} className="size-5" />
                            <span className="font-medium">{r.author}</span>
                            <span className={cn("inline-flex items-center gap-1", mark.cls)}>
                              <mark.Icon className="size-3.5" />
                              {mark.label}
                            </span>
                            <span className="text-muted-foreground">
                              · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          {r.bodyHtml ? (
                            <div className={htmlBox} dangerouslySetInnerHTML={{ __html: r.bodyHtml }} />
                          ) : null}
                        </div>
                      );
                    })}
                  </section>
                ) : null}

                {detail.comments.length > 0 ? (
                  <section className="space-y-2">
                    <h3 className="flex items-center gap-1.5">
                      <MessageSquare className="size-3.5 text-muted-foreground" />
                      <SectionLabel>Comments</SectionLabel>
                      <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[11px]">
                        {detail.comments.length}
                      </Badge>
                    </h3>
                    {detail.comments.map((c, i) => (
                      <EditableComment
                        key={c.databaseId ?? i}
                        repo={detail.repo}
                        kind="issue"
                        commentId={c.databaseId}
                        author={c.author}
                        bodyHtml={c.bodyHtml}
                        body={c.body}
                        createdAt={c.createdAt}
                        viewerLogin={detail.viewerLogin}
                        onChanged={reload}
                        subjectId={c.nodeId}
                        reactions={c.reactions}
                      />
                    ))}
                  </section>
                ) : null}

                {/* All inline review comments in one place (they also live on their lines in Code). */}
                {reviewCommentCount > 0 ? (
                  <section className="space-y-2">
                    <h3 className="flex items-center gap-1.5">
                      <MessageSquare className="size-3.5 text-muted-foreground" />
                      <SectionLabel>Review comments</SectionLabel>
                      <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[11px]">
                        {reviewCommentCount}
                      </Badge>
                    </h3>
                    {detail.reviewThreads.flatMap((t) =>
                      t.comments.map((c) => (
                        <EditableComment
                          key={c.id}
                          repo={detail.repo}
                          kind="review"
                          commentId={c.databaseId}
                          author={c.author}
                          bodyHtml={c.bodyHtml}
                          body={c.body}
                          createdAt={c.createdAt}
                          viewerLogin={detail.viewerLogin}
                          onChanged={reload}
                          label={t.line != null ? `${t.path}:${t.line}` : t.path}
                          subjectId={c.id}
                          reactions={c.reactions}
                        />
                      )),
                    )}
                  </section>
                ) : null}

              </div>
              </div>

              {/* Add-comment composer — a fixed footer below the scroll area (not inside it), so it
                  never overlaps the thread and can't be clipped at the scroll edge. */}
              <div className="mt-3 shrink-0 border-t pt-3">
                <div className="flex items-end gap-2">
                  <MentionTextarea
                    value={commentBody}
                    onChange={setCommentBody}
                    repo={detail.repo}
                    placeholder="Leave a comment… type @ to mention"
                    rows={2}
                    wrapperClassName="flex-1"
                    className="max-h-32 min-h-[2.5rem] resize-none bg-background"
                  />
                  <Button
                    size="sm"
                    onClick={postComment}
                    disabled={commentBusy || !commentBody.trim()}
                    className="shrink-0"
                  >
                    {commentBusy ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
                    Comment
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Timeline */}
            <TabsContent value="timeline" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <PrTimeline nodeId={nodeId} repo={detail.repo} number={detail.number} />
            </TabsContent>

            {/* Code */}
            <TabsContent value="code" className="mt-3 flex min-h-0 flex-1 flex-col">
              <PrCode
                repo={detail.repo}
                number={detail.number}
                headOid={detail.headOid}
                headBranch={detail.headBranch}
                headRepo={detail.headRepo}
                threads={detail.reviewThreads}
                viewerLogin={detail.viewerLogin}
                onChanged={reload}
              />
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>;
}
