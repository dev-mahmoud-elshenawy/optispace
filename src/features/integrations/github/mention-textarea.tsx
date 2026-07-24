"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { searchPrMentionUsers } from "./actions";

interface MentionUser {
  login: string;
  name: string | null;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  repo: string; // owner/name — the mentionable-user source
  placeholder?: string;
  rows?: number;
  className?: string;
  wrapperClassName?: string; // for the relative wrapper (e.g. flex-1 in a row)
  autoFocus?: boolean;
}

// Match the shadcn Textarea so this is a visual drop-in.
const TEXTAREA_CLASS =
  "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

// A plaintext textarea (GitHub mentions are just `@login` text) with an @-autocomplete dropdown of
// the repo's mentionable users. Inserting picks `@login ` at the caret; GitHub links + notifies.
export function MentionTextarea({
  value,
  onChange,
  repo,
  placeholder,
  rows = 2,
  className,
  wrapperClassName,
  autoFocus,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // Debounced mentionable-user search whenever an @query is active.
  useEffect(() => {
    if (query === null) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const found = await searchPrMentionUsers(repo, query);
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
  }, [query, repo]);

  // The @token immediately before the caret (start of line or after whitespace).
  function detect(el: HTMLTextAreaElement) {
    const before = el.value.slice(0, el.selectionStart ?? 0);
    const m = /(?:^|\s)@([\w-]*)$/.exec(before);
    setQuery(m ? m[1] : null);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    detect(e.target);
  }

  function insert(login: string) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) return;
    const next = `${before.slice(0, at)}@${login} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    setResults([]);
    const pos = at + login.length + 2; // after "@login "
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insert(results[active].login);
    } else if (e.key === "Escape") {
      setQuery(null);
      setResults([]);
    }
  }

  return (
    <div className={cn("relative", wrapperClassName)}>
      <textarea
        ref={ref}
        data-slot="textarea"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={cn(TEXTAREA_CLASS, className)}
      />
      {query !== null ? (
        <ul className="absolute bottom-full z-50 mb-1 max-h-56 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          {loading ? (
            <li className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Searching people…
            </li>
          ) : results.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No people found</li>
          ) : (
            results.map((r, i) => (
              <li key={r.login}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insert(r.login);
                  }}
                  className={cn(
                    "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-accent",
                    i === active && "bg-accent",
                  )}
                >
                  <span className="text-sm font-medium">@{r.login}</span>
                  {r.name ? <span className="text-xs text-muted-foreground">{r.name}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
