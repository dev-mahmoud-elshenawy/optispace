"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";

import { searchAzureDevOpsIdentities } from "@/features/integrations/azure-devops/actions";
import type { AdoIdentity } from "@/features/integrations/azure-devops/types";
import { cn } from "@/lib/utils";

interface MentionInputProps {
  initialHtml?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

// The anchor Azure DevOps recognises as a mention (and notifies the person for).
function mentionAnchor(identity: AdoIdentity): HTMLAnchorElement {
  const a = document.createElement("a");
  a.setAttribute("href", "#");
  a.setAttribute("data-vss-mention", `version:2.0,${identity.id}`);
  a.textContent = `@${identity.displayName}`;
  return a;
}

// A contentEditable that renders HTML (so mentions round-trip to ADO) and shows
// an @-mention suggestion dropdown while typing. Mentions are inserted as real
// `data-vss-mention` anchors; onChange returns the current innerHTML.
export function MentionInput({ initialHtml = "", onChange, placeholder, className }: MentionInputProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<AdoIdentity[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // Seed the editor once on mount (parent remounts via `key` to reset/reseed).
  useEffect(() => {
    if (ref.current && initialHtml) ref.current.innerHTML = initialHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced identity search whenever an @query is active.
  useEffect(() => {
    if (query === null) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const found = await searchAzureDevOpsIdentities(query);
      if (!cancelled) {
        setResults(found);
        setActive(0);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Read the @token immediately before a collapsed caret (single text node case).
  const detectQuery = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return setQuery(null);
    const range = sel.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return setQuery(null);
    const before = (range.startContainer.textContent ?? "").slice(0, range.startOffset);
    const match = /(?:^|\s)@([\w.\-]*)$/.exec(before);
    setQuery(match ? match[1] : null);
  }, []);

  function handleInput() {
    if (ref.current) onChange(ref.current.innerHTML);
    detectQuery();
  }

  function insertMention(identity: AdoIdentity) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const at = (node.textContent ?? "").slice(0, range.startOffset).lastIndexOf("@");
    if (at === -1) return;

    // Replace `@query` (from the @ up to the caret) with the mention + a space.
    const replace = document.createRange();
    replace.setStart(node, at);
    replace.setEnd(node, range.startOffset);
    replace.deleteContents();

    const anchor = mentionAnchor(identity);
    const space = document.createTextNode(" ");
    replace.insertNode(space);
    replace.insertNode(anchor);

    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);

    setQuery(null);
    setResults([]);
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (query === null || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(results[active]);
    } else if (e.key === "Escape") {
      setQuery(null);
      setResults([]);
    }
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className={cn(
          "rounded-lg border border-border p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
          "[&_a]:text-primary [&_a]:underline",
          className,
        )}
      />
      {query !== null ? (
        <ul className="absolute bottom-full z-50 mb-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          {loading ? (
            <li className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" /> Searching people…
            </li>
          ) : results.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No people found</li>
          ) : (
            results.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(r);
                }}
                className={cn(
                  "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-accent",
                  i === active && "bg-accent",
                )}
              >
                <span className="text-sm font-medium">{r.displayName}</span>
                {r.mail ? <span className="text-xs text-muted-foreground">{r.mail}</span> : null}
              </button>
            </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
