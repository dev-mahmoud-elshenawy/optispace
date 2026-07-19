"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Folder, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DiffFile } from "./types";

interface TreeNode {
  name: string; // display name (may be a compressed "a/b" folder path)
  path: string; // full path — set for file leaves
  file?: DiffFile;
  children: Map<string, TreeNode>;
}

function buildTree(files: DiffFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), children: new Map() };
        node.children.set(part, child);
      }
      if (i === parts.length - 1) child.file = f;
      node = child;
    });
  }
  return root;
}

// Collapse single-child folder chains ("assets" → "icons" becomes "assets/icons"), like GitHub.
function compress(node: TreeNode): TreeNode {
  let name = node.name;
  let children = [...node.children.values()].map(compress);
  while (!node.file && children.length === 1 && !children[0].file) {
    const only = children[0];
    name = name ? `${name}/${only.name}` : only.name;
    children = [...only.children.values()];
  }
  const map = new Map<string, TreeNode>();
  for (const c of children) map.set(c.name, c);
  return { name, path: node.path, file: node.file, children: map };
}

function sortedChildren(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => {
    const aFolder = !a.file;
    const bFolder = !b.file;
    if (aFolder !== bFolder) return aFolder ? -1 : 1; // folders first
    return a.name.localeCompare(b.name);
  });
}

// GitHub-style single-letter status chip.
const STATUS_CHIP: Record<string, { letter: string; className: string; title: string }> = {
  added: { letter: "A", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", title: "Added" },
  removed: { letter: "D", className: "bg-red-500/15 text-red-600 dark:text-red-400", title: "Removed" },
  renamed: { letter: "R", className: "bg-sky-500/15 text-sky-600 dark:text-sky-400", title: "Renamed" },
  modified: { letter: "M", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400", title: "Modified" },
};

function StatusChip({ status }: { status: string }) {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.modified;
  return (
    <span
      title={chip.title}
      className={cn("flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-bold", chip.className)}
    >
      {chip.letter}
    </span>
  );
}

export function PrFileTree({
  files,
  viewed,
  onSelect,
}: {
  files: DiffFile[];
  viewed?: Set<string>;
  onSelect: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);

  const root = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;
    return compress(buildTree(filtered));
  }, [files, query]);

  const filtering = query.trim().length > 0;

  function select(path: string) {
    setActive(path);
    onSelect(path);
  }

  return (
    <div className="sticky top-0 flex max-h-[calc(92vh-11rem)] w-60 shrink-0 flex-col gap-2 self-start">
      <div className="flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Files</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">{files.length}</span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter files…"
          className="h-8 w-full rounded-md border border-border bg-transparent py-1.5 pl-8 pr-7 text-xs outline-none transition-colors focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-ring"
        />
        {filtering ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear filter"
            className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>

      <div className="-mr-1 min-h-0 flex-1 space-y-0.5 overflow-auto pr-1 text-xs">
        {root.children.size === 0 ? (
          <p className="px-1 py-2 text-muted-foreground">No files match.</p>
        ) : (
          sortedChildren(root).map((n) => (
            <TreeItem
              key={n.path || n.name}
              node={n}
              depth={0}
              onSelect={select}
              activePath={active}
              viewed={viewed}
              forceOpen={filtering}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TreeItem({
  node,
  depth,
  onSelect,
  activePath,
  viewed,
  forceOpen,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
  activePath: string | null;
  viewed?: Set<string>;
  forceOpen: boolean;
}) {
  const pad = { paddingLeft: `${depth * 14 + 8}px` };

  if (node.file) {
    const file = node.file;
    const isActive = activePath === file.path;
    const isViewed = viewed?.has(file.path) ?? false;
    return (
      <button
        type="button"
        onClick={() => onSelect(file.path)}
        style={pad}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md py-1.5 pr-1.5 text-left transition-colors hover:bg-accent/60",
          isActive && "bg-accent font-medium",
        )}
        title={file.path}
      >
        <StatusChip status={file.status} />
        <span className={cn("truncate", isViewed && "text-muted-foreground")}>{node.name}</span>
        {isViewed ? (
          <Check className="ml-auto size-3.5 shrink-0 text-emerald-500" aria-label="Viewed" />
        ) : (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
            {file.additions > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
            ) : null}
            {file.deletions > 0 ? <span className="text-red-600 dark:text-red-400">−{file.deletions}</span> : null}
          </span>
        )}
      </button>
    );
  }

  return (
    <details className="group" open={forceOpen || depth < 2}>
      <summary
        style={pad}
        className="flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-1 hover:bg-accent/60 [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <Folder className="size-3.5 shrink-0 text-sky-500/70" />
        <span className="truncate font-medium text-foreground/90">{node.name}</span>
      </summary>
      <div className="space-y-0.5">
        {sortedChildren(node).map((n) => (
          <TreeItem
            key={n.path || n.name}
            node={n}
            depth={depth + 1}
            onSelect={onSelect}
            activePath={activePath}
            viewed={viewed}
            forceOpen={forceOpen}
          />
        ))}
      </div>
    </details>
  );
}
