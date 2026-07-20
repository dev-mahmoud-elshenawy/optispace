"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import hljs from "highlight.js/lib/common";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileDiff,
  GitCommit,
  Lightbulb,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import "highlight.js/styles/github-dark.css";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  addPrFileComment,
  addPrLineComment,
  applyPrSuggestion,
  getCommitRangeFiles,
  getPullRequestCommits,
  getPullRequestFiles,
  replyPrThread,
  setPrThreadResolved,
  submitPrReviewBatch,
} from "./actions";
import { MentionTextarea } from "./mention-textarea";
import { EditableComment } from "./pr-comment";
import { PrFileTree } from "./pr-file-tree";
import { extractSuggestion } from "./types";
import type { DiffFile, DiffLine, PendingReviewComment, PrCommit, ReviewThread } from "./types";

// File extension → highlight.js language (common set). Unknown → no highlight (escaped plain).
const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", kts: "kotlin",
  swift: "swift", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", php: "php", sh: "bash", bash: "bash",
  yml: "yaml", yaml: "yaml", css: "css", scss: "scss", less: "less", html: "xml", xml: "xml", vue: "xml",
  md: "markdown", sql: "sql", dart: "dart", gradle: "groovy", rb2: "ruby",
};

function langFor(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Highlight a single diff line. Per-line (context lost across lines) — good enough for a diff.
function highlightLine(content: string, lang: string | null): string {
  if (!content) return "";
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
    } catch {
      // fall through to escaped plain
    }
  }
  return escapeHtml(content);
}

interface PrCodeProps {
  repo: string;
  number: number;
  headOid: string;
  headBranch: string; // where "Apply suggestion" commits
  headRepo: string; // head repository owner/name (may be a fork)
  threads: ReviewThread[];
  viewerLogin: string;
  onChanged: () => void; // re-fetch the PR detail after a write
}

// Which line's inline composer is open (only one at a time).
interface ActiveLine {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
}

export function PrCode({ repo, number, headOid, headBranch, headRepo, threads, viewerLogin, onChanged }: PrCodeProps) {
  const [files, setFiles] = useState<DiffFile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewBusy, setReviewBusy] = useState<null | string>(null);
  const [pending, setPending] = useState<PendingReviewComment[]>([]); // queued into a batched review
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // controlled per-file open/closed
  const [viewed, setViewed] = useState<Set<string>>(new Set()); // GitHub-style "Viewed" toggle
  const [commits, setCommits] = useState<PrCommit[]>([]); // for the "filter by commit" picker
  const [selectedShas, setSelectedShas] = useState<string[]>([]); // [] = whole PR; else selected commits
  const fileRefs = useRef(new Map<string, HTMLDivElement>()); // file path → its container, for tree click-to-scroll

  // What diff to fetch: the whole PR, a single commit, or a base..head range (multi-select). planKey is
  // a primitive so the effect below doesn't refetch when the memo rebuilds an equal plan.
  const { plan, planKey } = useMemo(() => {
    const set = new Set(selectedShas);
    const chosen = commits.filter((c) => set.has(c.sha)); // keeps commit order
    if (chosen.length === 0) return { plan: { kind: "all" as const }, planKey: "all" };
    if (chosen.length === 1) {
      return { plan: { kind: "commit" as const, sha: chosen[0].sha }, planKey: `c:${chosen[0].sha}` };
    }
    const base = chosen[0].parentSha;
    const head = chosen[chosen.length - 1].sha;
    return { plan: { kind: "range" as const, base, head }, planKey: `r:${base}:${head}` };
  }, [commits, selectedShas]);

  // Lazy-load the diff when the Code tab mounts (or the commit selection changes) — keeps the modal's
  // initial open fast, then swaps to a single commit / range diff on selection.
  useEffect(() => {
    let active = true;
    setFiles(null);
    setLoadError(null);
    const req =
      plan.kind === "all"
        ? getPullRequestFiles(repo, number)
        : plan.kind === "commit"
          ? getPullRequestFiles(repo, number, plan.sha)
          : getCommitRangeFiles(repo, plan.base, plan.head);
    req.then((res) => {
      if (!active) return;
      if (res.ok) {
        setFiles(res.files);
        // Start with huge / empty files collapsed so the diff opens light.
        setCollapsed(new Set(res.files.filter((f) => f.lines.length === 0 || f.lines.length >= 400).map((f) => f.path)));
        setViewed(new Set());
      } else {
        setLoadError(res.error);
      }
    });
    return () => {
      active = false;
    };
    // keyed on planKey; `plan` is read fresh from the render that changed planKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, number, planKey]);

  // Commit list for the picker — fetched once per PR.
  useEffect(() => {
    let active = true;
    getPullRequestCommits(repo, number).then((res) => {
      if (active && res.ok) setCommits(res.commits);
    });
    return () => {
      active = false;
    };
  }, [repo, number]);

  const totals = useMemo(() => {
    const add = (files ?? []).reduce((n, f) => n + f.additions, 0);
    const del = (files ?? []).reduce((n, f) => n + f.deletions, 0);
    return { add, del };
  }, [files]);

  function setOpen(path: string, open: boolean) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleViewed(path: string) {
    const nowViewed = !viewed.has(path);
    setViewed((prev) => {
      const next = new Set(prev);
      if (nowViewed) next.add(path);
      else next.delete(path);
      return next;
    });
    // Marking a file viewed collapses it (like GitHub); un-viewing re-opens it.
    setOpen(path, !nowViewed);
  }

  function addPending(c: PendingReviewComment) {
    setPending((prev) => [...prev, c]);
  }

  async function review(event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT") {
    setReviewBusy(event);
    const res = await submitPrReviewBatch(repo, number, event, reviewBody, pending);
    setReviewBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setReviewBody("");
    setPending([]);
    toast.success(pending.length > 0 ? `Review submitted with ${pending.length} comment${pending.length === 1 ? "" : "s"}.` : "Review submitted.");
    onChanged();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Commit picker — filter the diff to one or more commits (GitHub "Select commits to view"). */}
      {commits.length > 0 ? (
        <CommitFilter commits={commits} selectedShas={selectedShas} onApply={setSelectedShas} />
      ) : null}

      {loadError ? (
        <p className="py-6 text-sm text-destructive">{loadError}</p>
      ) : files === null ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading diff…
        </div>
      ) : files.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {selectedShas.length > 0 ? "No changes in the selected commits." : "No file changes to show."}
        </p>
      ) : (
        <>
      {/* Toolbar — totals, viewed progress, bulk expand/collapse */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{files.length}</span> file{files.length === 1 ? "" : "s"} changed
          </span>
          <span className="font-mono tabular-nums">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{totals.add}</span>{" "}
            <span className="font-semibold text-destructive">−{totals.del}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Check className="size-3.5 text-emerald-500" />
            <span className="tabular-nums">
              {viewed.size}/{files.length} viewed
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCollapsed(new Set())}>
            <ChevronDown className="size-3.5" /> Expand all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setCollapsed(new Set(files.map((f) => f.path)))}
          >
            <ChevronRight className="size-3.5" /> Collapse all
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto pr-1">
        <PrFileTree
          files={files}
          viewed={viewed}
          onSelect={(path) => {
            setOpen(path, true);
            fileRefs.current.get(path)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <div className="min-w-0 flex-1 space-y-3">
          {files.map((file) => (
            <FileBlock
              key={file.path}
              file={file}
              repo={repo}
              number={number}
              headOid={headOid}
              headBranch={headBranch}
              headRepo={headRepo}
              threads={threads}
              viewerLogin={viewerLogin}
              onChanged={onChanged}
              onAddPending={addPending}
              open={!collapsed.has(file.path)}
              onToggleOpen={(open) => setOpen(file.path, open)}
              viewed={viewed.has(file.path)}
              onToggleViewed={() => toggleViewed(file.path)}
              containerRef={(el) => {
                if (el) fileRefs.current.set(file.path, el);
                else fileRefs.current.delete(file.path);
              }}
            />
          ))}
        </div>
      </div>

      {/* Submit-review composer — a polished fixed footer card below the scrollable diff. */}
      <div className="shrink-0 rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <MessageSquarePlus className="size-3.5" />
          Finish your review
        </div>
        <MentionTextarea
          value={reviewBody}
          onChange={setReviewBody}
          repo={repo}
          placeholder="Leave an overall comment… type @ to mention someone"
          rows={3}
          className="resize-none bg-background"
        />
        {pending.length > 0 ? (
          <div className="mt-2.5 space-y-1 rounded-lg border border-primary/30 bg-primary/[0.04] p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pending · {pending.length} comment{pending.length === 1 ? "" : "s"} to submit with this review
            </p>
            {pending.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <code className="shrink-0 rounded bg-muted px-1 text-muted-foreground">
                  {c.path}:{c.line}
                </code>
                <span className="min-w-0 flex-1 truncate">{c.body}</span>
                <button
                  type="button"
                  onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                  aria-label="Remove pending comment"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => review("APPROVE")}
            disabled={reviewBusy !== null}
            className="bg-emerald-600 text-white hover:bg-emerald-600/90 focus-visible:ring-emerald-600/30"
          >
            {reviewBusy === "APPROVE" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Approve
          </Button>
          <Button size="sm" variant="destructive" onClick={() => review("REQUEST_CHANGES")} disabled={reviewBusy !== null}>
            {reviewBusy === "REQUEST_CHANGES" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            Request changes
          </Button>
          <Button size="sm" variant="outline" onClick={() => review("COMMENT")} disabled={reviewBusy !== null}>
            {reviewBusy === "COMMENT" ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
            Comment
          </Button>
          <span className="ml-auto hidden text-xs text-muted-foreground md:block">
            Approve / Request changes can be sent without a comment.
          </span>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

// GitHub-style "Select commits to view" — the whole PR diff, one commit, or a checkbox range.
// A checked selection is normalised to a contiguous range (earliest→latest) on Save.
function CommitFilter({
  commits,
  selectedShas,
  onApply,
}: {
  commits: PrCommit[];
  selectedShas: string[];
  onApply: (shas: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set(selectedShas));

  function openChange(next: boolean) {
    if (next) setDraft(new Set(selectedShas)); // seed the draft from the applied selection each open
    setOpen(next);
  }

  function toggle(sha: string, checked: boolean) {
    setDraft((prev) => {
      const n = new Set(prev);
      if (checked) n.add(sha);
      else n.delete(sha);
      return n;
    });
  }

  function save() {
    const idxs = commits.map((c, i) => (draft.has(c.sha) ? i : -1)).filter((i) => i >= 0);
    if (idxs.length === 0) {
      onApply([]);
    } else {
      const min = Math.min(...idxs);
      const max = Math.max(...idxs);
      onApply(commits.slice(min, max + 1).map((c) => c.sha)); // contiguous span
    }
    setOpen(false);
  }

  const draftIdxs = commits.map((c, i) => (draft.has(c.sha) ? i : -1)).filter((i) => i >= 0);
  const spanCount = draftIdxs.length ? Math.max(...draftIdxs) - Math.min(...draftIdxs) + 1 : 0;

  const count = selectedShas.length;
  const single = count === 1 ? commits.find((c) => c.sha === selectedShas[0]) ?? null : null;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu open={open} onOpenChange={openChange}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 min-w-0 max-w-[30rem] gap-2">
            <GitCommit className="size-4 shrink-0 text-indigo-500" />
            <span className="truncate">
              {count === 0 ? (
                <>
                  All commits <span className="text-muted-foreground">· {commits.length}</span>
                </>
              ) : single ? (
                <>
                  <code className="font-mono text-xs">{single.abbreviatedOid}</code> {single.message}
                </>
              ) : (
                <>{count} commits selected</>
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="flex w-[28rem] max-w-[92vw] flex-col p-0">
          <DropdownMenuLabel className="px-3 py-2">Select commits to view</DropdownMenuLabel>
          <div className="max-h-[340px] overflow-y-auto p-1">
            <DropdownMenuItem
              className="gap-2"
              onSelect={(e) => {
                e.preventDefault();
                setDraft(new Set());
              }}
            >
              <Check className={cn("mt-0.5 size-4 shrink-0", draft.size === 0 ? "text-primary" : "opacity-0")} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">All commits</p>
                <p className="text-xs text-muted-foreground">
                  {commits.length} commit{commits.length === 1 ? "" : "s"} — the full PR diff
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {commits.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.sha}
                checked={draft.has(c.sha)}
                onCheckedChange={(v) => toggle(c.sha, v === true)}
                onSelect={(e) => e.preventDefault()}
                className="items-start gap-2 pr-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.message}</p>
                  {c.body ? (
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{c.body}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.author}
                    {c.date ? ` committed ${formatDistanceToNow(new Date(c.date), { addSuffix: true })}` : ""}
                  </p>
                </div>
                <code className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">{c.abbreviatedOid}</code>
              </DropdownMenuCheckboxItem>
            ))}
          </div>
          <DropdownMenuSeparator />
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {spanCount === 0 ? "All commits" : `${spanCount} commit${spanCount === 1 ? "" : "s"} in range`}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-7" onClick={save}>
                Save
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {count > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
          onClick={() => onApply([])}
        >
          Show all
        </Button>
      ) : null}
    </div>
  );
}

function FileBlock({
  file,
  repo,
  number,
  headOid,
  headBranch,
  headRepo,
  threads,
  viewerLogin,
  onChanged,
  onAddPending,
  open,
  onToggleOpen,
  viewed,
  onToggleViewed,
  containerRef,
}: {
  file: DiffFile;
  repo: string;
  number: number;
  headOid: string;
  headBranch: string;
  headRepo: string;
  threads: ReviewThread[];
  viewerLogin: string;
  onChanged: () => void;
  onAddPending: (c: PendingReviewComment) => void;
  open: boolean;
  onToggleOpen: (open: boolean) => void;
  viewed: boolean;
  onToggleViewed: () => void;
  containerRef: (el: HTMLDivElement | null) => void;
}) {
  const [active, setActive] = useState<ActiveLine | null>(null);
  const [fileComposer, setFileComposer] = useState(false);
  const lang = langFor(file.path);

  const fileThreads = threads.filter((t) => t.path === file.path);
  // Which side:line pairs actually exist in the rendered diff — a thread can only be shown inline on a
  // line that's present. Anything else must NOT be dropped; it falls to the "other comments" block.
  const presentLines = new Set<string>();
  for (const dl of file.lines) {
    if (dl.type === "hunk") continue;
    const side = dl.type === "del" ? "LEFT" : "RIGHT";
    const ln = side === "LEFT" ? dl.oldLine : dl.newLine;
    if (ln != null) presentLines.add(`${side}:${ln}`);
  }
  // Inline threads keyed by side+line; outdated / line-less / off-diff ones drop to a block below so
  // no previous comment ever disappears (e.g. its line isn't in the current or commit-filtered diff).
  const byLine = new Map<string, ReviewThread[]>();
  const orphan: ReviewThread[] = [];
  for (const t of fileThreads) {
    const key = t.line != null ? `${t.diffSide}:${t.line}` : "";
    if (t.line == null || t.isOutdated || !presentLines.has(key)) {
      orphan.push(t);
      continue;
    }
    const arr = byLine.get(key);
    if (arr) arr.push(t);
    else byLine.set(key, [t]);
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "scroll-mt-2 overflow-hidden rounded-lg border transition-colors",
        viewed ? "border-emerald-500/30" : "border-border/60",
      )}
    >
      {/* File header */}
      <div className={cn("flex items-center gap-2 bg-muted/30 px-3 py-2 text-sm", viewed && "opacity-70")}>
        <button
          type="button"
          onClick={() => onToggleOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <FileDiff className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{file.path}</span>
        </button>
        <span className="shrink-0 space-x-2 font-mono text-xs tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
          <span className="text-destructive">−{file.deletions}</span>
        </span>
        {fileThreads.length > 0 ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
            title="Comments on this file"
          >
            <MessageSquare className="size-3" />
            {fileThreads.reduce((n, t) => n + t.comments.length, 0)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setFileComposer((v) => !v)}
          title="Comment on this file"
          aria-label="Comment on this file"
          className={cn(
            "rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            fileComposer && "bg-accent text-foreground",
          )}
        >
          <MessageSquarePlus className="size-4" />
        </button>
        <label className="flex cursor-pointer select-none items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent">
          <Checkbox checked={viewed} onCheckedChange={onToggleViewed} />
          Viewed
        </label>
      </div>

      {fileComposer ? (
        <div className="border-b border-border/60 bg-background px-3 py-2">
          <FileComposer
            repo={repo}
            onSubmit={async (body) => {
              const res = await addPrFileComment(repo, number, headOid, file.path, body);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              setFileComposer(false);
              toast.success("File comment added.");
              onChanged();
            }}
            onCancel={() => setFileComposer(false)}
          />
        </div>
      ) : null}

      {open ? (
        file.binary ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Binary file — no text diff.</p>
        ) : (
          <div className="overflow-x-auto bg-[#0d1117] text-zinc-200">
            <table className="w-full border-collapse font-mono text-xs">
              <tbody>
                {file.lines.map((dl, i) => {
                  const side: "LEFT" | "RIGHT" = dl.type === "del" ? "LEFT" : "RIGHT";
                  const lineNo = side === "LEFT" ? dl.oldLine : dl.newLine;
                  const lineThreads = lineNo != null ? byLine.get(`${side}:${lineNo}`) ?? [] : [];
                  const composerOpen = active?.path === file.path && active.line === lineNo && active.side === side;
                  return (
                    <LineRow
                      key={i}
                      dl={dl}
                      lang={lang}
                      canComment={dl.type !== "hunk" && lineNo != null}
                      onAdd={() => lineNo != null && setActive({ path: file.path, line: lineNo, side })}
                      threads={lineThreads}
                      repo={repo}
                      number={number}
                      headBranch={headBranch}
                      headRepo={headRepo}
                      viewerLogin={viewerLogin}
                      onChanged={onChanged}
                      composerOpen={composerOpen}
                      endLine={lineNo ?? 0}
                      onSubmitComposer={async (body, startLine) => {
                        if (lineNo == null) return;
                        const res = await addPrLineComment(repo, number, headOid, file.path, lineNo, side, body, startLine);
                        if (!res.ok) {
                          toast.error(res.error);
                          return;
                        }
                        setActive(null);
                        toast.success("Comment added.");
                        onChanged();
                      }}
                      onAddToReviewComposer={(body, startLine) => {
                        if (lineNo == null) return;
                        onAddPending({ path: file.path, line: lineNo, side, startLine: startLine ?? null, body });
                        setActive(null);
                        toast.success("Added to review.");
                      }}
                      onCancelComposer={() => setActive(null)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {open && orphan.length > 0 ? (
        <div className="space-y-2 border-t border-border/60 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            {orphan.reduce((n, t) => n + t.comments.length, 0)} comment
            {orphan.reduce((n, t) => n + t.comments.length, 0) === 1 ? "" : "s"} — outdated or not on a line shown here
          </p>
          {orphan.map((t) => (
            <ThreadView
              key={t.id}
              thread={t}
              repo={repo}
              number={number}
              headBranch={headBranch}
              headRepo={headRepo}
              viewerLogin={viewerLogin}
              onChanged={onChanged}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LineRow({
  dl,
  lang,
  canComment,
  onAdd,
  threads,
  repo,
  number,
  headBranch,
  headRepo,
  viewerLogin,
  onChanged,
  composerOpen,
  endLine,
  onSubmitComposer,
  onAddToReviewComposer,
  onCancelComposer,
}: {
  dl: DiffLine;
  lang: string | null;
  canComment: boolean;
  onAdd: () => void;
  threads: ReviewThread[];
  repo: string;
  number: number;
  headBranch: string;
  headRepo: string;
  viewerLogin: string;
  onChanged: () => void;
  composerOpen: boolean;
  endLine: number;
  onSubmitComposer: (body: string, startLine?: number | null) => Promise<void>;
  onAddToReviewComposer: (body: string, startLine?: number | null) => void;
  onCancelComposer: () => void;
}) {
  const bg =
    dl.type === "add"
      ? "bg-emerald-500/15"
      : dl.type === "del"
        ? "bg-red-500/15"
        : dl.type === "hunk"
          ? "bg-white/5 text-zinc-400"
          : "";
  const marker = dl.type === "add" ? "+" : dl.type === "del" ? "-" : dl.type === "hunk" ? "" : " ";

  return (
    <>
      <tr className={cn("group", bg)}>
        <td className="w-10 select-none border-r border-white/10 px-1 text-right text-zinc-500">{dl.oldLine ?? ""}</td>
        <td className="w-10 select-none border-r border-white/10 px-1 text-right text-zinc-500">{dl.newLine ?? ""}</td>
        <td className="w-6 text-center">
          {canComment ? (
            <button
              type="button"
              onClick={onAdd}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Add comment on this line"
            >
              <MessageSquarePlus className="size-3.5 text-sky-400" />
            </button>
          ) : null}
        </td>
        <td className="whitespace-pre-wrap break-all px-2">
          <span className="select-none text-zinc-600">{marker}</span>
          <span dangerouslySetInnerHTML={{ __html: highlightLine(dl.content, lang) }} />
        </td>
      </tr>

      {threads.map((t) => (
        <tr key={t.id}>
          <td colSpan={4} className="px-3 py-2">
            <ThreadView
              thread={t}
              repo={repo}
              number={number}
              headBranch={headBranch}
              headRepo={headRepo}
              viewerLogin={viewerLogin}
              onChanged={onChanged}
            />
          </td>
        </tr>
      ))}

      {composerOpen ? (
        <tr>
          <td colSpan={4} className="px-3 py-2">
            <LineComposer
              endLine={endLine}
              repo={repo}
              lineContent={dl.content}
              onSubmit={onSubmitComposer}
              onAddToReview={onAddToReviewComposer}
              onCancel={onCancelComposer}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function LineComposer({
  endLine,
  repo,
  lineContent,
  onSubmit,
  onAddToReview,
  onCancel,
}: {
  endLine: number;
  repo: string;
  lineContent: string; // the current line — seeds a "Suggest" block
  onSubmit: (body: string, startLine?: number | null) => Promise<void>;
  onAddToReview: (body: string, startLine?: number | null) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [startLine, setStartLine] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-2 font-sans text-foreground">
      <MentionTextarea value={body} onChange={setBody} repo={repo} placeholder={`Comment on line ${endLine}… type @ to mention`} rows={2} autoFocus />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Range from line
          <input
            type="number"
            value={startLine}
            onChange={(e) => setStartLine(e.target.value)}
            placeholder="—"
            className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
            max={endLine - 1}
            min={1}
          />
          <span>to {endLine}</span>
        </label>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title="Insert a suggested-change block seeded with this line"
            onClick={() => setBody((b) => (b.includes("```suggestion") ? b : `\`\`\`suggestion\n${lineContent}\n\`\`\`\n${b}`))}
          >
            <Lightbulb className="size-4" /> Suggest
          </Button>
          <Button
            size="sm"
            disabled={busy || !body.trim()}
            title="Queue this into your review — submit all comments at once"
            onClick={() => {
              const start = startLine.trim() ? Number(startLine) : null;
              onAddToReview(body, start != null && start < endLine ? start : null);
            }}
          >
            Add to review
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !body.trim()}
            title="Post this one comment immediately"
            onClick={async () => {
              const start = startLine.trim() ? Number(startLine) : null;
              setBusy(true);
              await onSubmit(body, start != null && start < endLine ? start : null);
              setBusy(false);
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Comment now
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function FileComposer({ repo, onSubmit, onCancel }: { repo: string; onSubmit: (body: string) => Promise<void>; onCancel: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 py-1 font-sans text-foreground">
      <MentionTextarea value={body} onChange={setBody} repo={repo} placeholder="Comment on the whole file… type @ to mention" rows={2} autoFocus />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || !body.trim()}
          onClick={async () => {
            setBusy(true);
            await onSubmit(body);
            setBusy(false);
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Comment
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ThreadView({
  thread,
  repo,
  number,
  headBranch,
  headRepo,
  viewerLogin,
  onChanged,
}: {
  thread: ReviewThread;
  repo: string;
  number: number;
  headBranch: string;
  headRepo: string;
  viewerLogin: string;
  onChanged: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [expanded, setExpanded] = useState(!thread.isResolved); // resolved threads start collapsed
  const lastDbId = [...thread.comments].reverse().find((c) => c.databaseId != null)?.databaseId ?? null;
  const first = thread.comments[0];
  // Suggestions commit onto the new-side lines; only applicable while the thread still maps to them.
  const canApply = thread.line != null && thread.diffSide === "RIGHT" && !thread.isOutdated;

  async function apply(replacement: string) {
    if (thread.line == null) return;
    setApplyBusy(true);
    const res = await applyPrSuggestion(headRepo, headBranch, thread.path, thread.startLine ?? thread.line, thread.line, replacement);
    setApplyBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Suggestion committed to ${headBranch}.`);
    onChanged();
  }

  async function reply() {
    if (lastDbId == null) return;
    setBusy(true);
    const res = await replyPrThread(repo, number, lastDbId, body);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setBody("");
    setReplying(false);
    toast.success("Reply added.");
    onChanged();
  }

  async function toggleResolve() {
    setResolveBusy(true);
    const res = await setPrThreadResolved(thread.id, !thread.isResolved);
    setResolveBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(thread.isResolved ? "Thread unresolved." : "Thread resolved.");
    onChanged();
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border bg-background p-2 font-sans text-foreground",
        thread.isResolved ? "border-emerald-500/30" : "border-border",
      )}
    >
      {/* Header — click to collapse/expand; resolved threads fold to this one line by default. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs"
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
          />
          {thread.isResolved ? (
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" /> Resolved
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
              <MessageSquarePlus className="size-3.5" /> Open
            </span>
          )}
          <span className="shrink-0 text-muted-foreground">
            · {thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}
          </span>
          {first ? <span className="truncate text-muted-foreground">· {first.author}</span> : null}
        </button>
        <button
          type="button"
          onClick={toggleResolve}
          disabled={resolveBusy}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {resolveBusy ? <Loader2 className="size-3 animate-spin" /> : null}
          {thread.isResolved ? "Unresolve" : "Resolve"}
        </button>
      </div>
      {!expanded ? null : (
        <>
      {thread.comments.map((c) => {
        const suggestion = extractSuggestion(c.body);
        return (
          <div key={c.id} className="space-y-1.5">
            <EditableComment
              repo={repo}
              kind="review"
              commentId={c.databaseId}
              author={c.author}
              bodyHtml={c.bodyHtml}
              body={c.body}
              createdAt={c.createdAt}
              viewerLogin={viewerLogin}
              onChanged={onChanged}
              subjectId={c.id}
              reactions={c.reactions}
            />
            {suggestion !== null && canApply ? (
              <Button size="sm" variant="outline" className="h-7" disabled={applyBusy} onClick={() => apply(suggestion)}>
                {applyBusy ? <Loader2 className="size-3.5 animate-spin" /> : <GitCommit className="size-3.5" />}
                Apply suggestion
              </Button>
            ) : null}
          </div>
        );
      })}
      {replying ? (
        <div className="space-y-2">
          <MentionTextarea value={body} onChange={setBody} repo={repo} placeholder="Reply… type @ to mention" rows={2} autoFocus />
          <div className="flex gap-2">
            <Button size="sm" onClick={reply} disabled={busy || !body.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Reply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReplying(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : lastDbId != null ? (
        <button type="button" onClick={() => setReplying(true)} className="text-xs text-primary hover:underline">
          Reply
        </button>
      ) : null}
        </>
      )}
    </div>
  );
}
