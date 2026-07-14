"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SubtaskDraftListProps {
  titles: string[];
  onChange: (titles: string[]) => void;
}

// Buffered subtask list for the New Task dialog: no persisted rows yet, so it just
// collects titles. The parent passes them to createTask, which persists them with
// the task in one transaction. Editing an existing task uses SubtaskChecklist instead.
export function SubtaskDraftList({ titles, onChange }: SubtaskDraftListProps) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value) return;
    onChange([...titles, value]);
    setDraft("");
  }

  function remove(index: number) {
    onChange(titles.filter((_, i) => i !== index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Subtasks</span>
        {titles.length > 0 ? (
          <span className="text-xs text-muted-foreground tabular-nums">{titles.length}</span>
        ) : null}
      </div>

      {titles.length > 0 ? (
        <ul className="space-y-1.5">
          {titles.map((title, index) => (
            <li key={index} className="group flex items-center gap-2">
              <span className="flex-1 text-sm">{title}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => remove(index)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a subtask…"
          className="h-8"
        />
        <Button type="button" variant="outline" size="icon-sm" onClick={add} disabled={draft.trim().length === 0}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}
