"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { searchPrIssueRefs, searchPrMentionUsers } from "./actions";

type Trigger = "@" | "#";

// A normalized autocomplete row: `value` is inserted after the trigger; primary/secondary are shown.
interface Suggestion {
  value: string; // login (for @) or issue/PR number (for #)
  primary: string; // "@login" / "#123"
  secondary: string | null; // display name / issue title
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  repo: string; // owner/name — the mentionable-user / issue-ref source
  placeholder?: string;
  rows?: number;
  className?: string;
  wrapperClassName?: string; // for the relative wrapper (e.g. flex-1 in a row)
  autoFocus?: boolean;
}

// Match the shadcn Textarea so this is a visual drop-in.
const TEXTAREA_CLASS =
  "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

// Per-trigger copy for the dropdown states.
const LABELS: Record<Trigger, { loading: string; empty: string }> = {
  "@": { loading: "Searching people…", empty: "No people found" },
  "#": { loading: "Searching issues…", empty: "No matches" },
};

async function fetchSuggestions(trigger: Trigger, repo: string, query: string): Promise<Suggestion[]> {
  if (trigger === "@") {
    const users = await searchPrMentionUsers(repo, query);
    return users.map((u) => ({ value: u.login, primary: `@${u.login}`, secondary: u.name }));
  }
  const issues = await searchPrIssueRefs(repo, query);
  return issues.map((i) => ({ value: String(i.number), primary: `#${i.number}`, secondary: i.title }));
}

// A plaintext textarea (GitHub mentions/refs are just `@login` / `#123` text) with an autocomplete
// dropdown. `@` lists the repo's mentionable users; `#` lists issues/PRs. Inserting drops the token
// at the caret; GitHub links + (for @) notifies.
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
  const [token, setToken] = useState<{ trigger: Trigger; query: string } | null>(null);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // Debounced suggestion search whenever a trigger token is active.
  useEffect(() => {
    if (token === null) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const found = await fetchSuggestions(token.trigger, repo, token.query);
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
  }, [token, repo]);

  // The @/# token immediately before the caret (start of line or after whitespace).
  function detect(el: HTMLTextAreaElement) {
    const before = el.value.slice(0, el.selectionStart ?? 0);
    const at = /(?:^|\s)@([\w-]*)$/.exec(before);
    if (at) {
      setToken({ trigger: "@", query: at[1] });
      return;
    }
    const hash = /(?:^|\s)#([\w-]*)$/.exec(before);
    if (hash) {
      setToken({ trigger: "#", query: hash[1] });
      return;
    }
    setToken(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    detect(e.target);
  }

  function insert(s: Suggestion) {
    const el = ref.current;
    if (!el || token === null) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf(token.trigger);
    if (at === -1) return;
    const inserted = `${token.trigger}${s.value} `;
    const next = `${before.slice(0, at)}${inserted}${value.slice(caret)}`;
    onChange(next);
    setToken(null);
    setResults([]);
    const pos = at + inserted.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (token === null || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insert(results[active]);
    } else if (e.key === "Escape") {
      setToken(null);
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
        onBlur={() => setTimeout(() => setToken(null), 150)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={cn(TEXTAREA_CLASS, className)}
      />
      {token !== null ? (
        <ul className="absolute bottom-full z-50 mb-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          {loading ? (
            <li className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {LABELS[token.trigger].loading}
            </li>
          ) : results.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">{LABELS[token.trigger].empty}</li>
          ) : (
            results.map((r, i) => (
              <li key={r.value}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insert(r);
                  }}
                  className={cn(
                    "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-accent",
                    i === active && "bg-accent",
                  )}
                >
                  <span className="text-sm font-medium">{r.primary}</span>
                  {r.secondary ? <span className="w-full truncate text-xs text-muted-foreground">{r.secondary}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
