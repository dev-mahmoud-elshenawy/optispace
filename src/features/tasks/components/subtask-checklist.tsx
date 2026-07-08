"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addSubtask, deleteSubtask, toggleSubtask } from "@/features/tasks/actions";
import type { SubtaskView } from "@/features/tasks/service";

interface SubtaskChecklistProps {
  taskId: string;
  subtasks: SubtaskView[];
}

export function SubtaskChecklist({ taskId, subtasks }: SubtaskChecklistProps) {
  const [items, setItems] = useState<SubtaskView[]>(subtasks);
  const [title, setTitle] = useState("");
  const [, startTransition] = useTransition();

  const doneCount = items.filter((s) => s.done).length;

  function handleToggle(id: string, done: boolean) {
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, done } : s)));
    startTransition(async () => {
      const result = await toggleSubtask(id, done);
      if (!result.ok) {
        toast.error(result.error);
        setItems((prev) => prev.map((s) => (s.id === id ? { ...s, done: !done } : s)));
      }
    });
  }

  function handleDelete(id: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((s) => s.id !== id));
    startTransition(async () => {
      const result = await deleteSubtask(id);
      if (!result.ok) {
        toast.error(result.error);
        setItems(snapshot);
      }
    });
  }

  function submitAdd() {
    const value = title.trim();
    if (!value) return;
    setTitle("");
    startTransition(async () => {
      const result = await addSubtask(taskId, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setItems((prev) => [...prev, result.subtask]);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAdd();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Subtasks</span>
        {items.length > 0 ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {doneCount}/{items.length}
          </span>
        ) : null}
      </div>

      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((subtask) => (
            <li key={subtask.id} className="group flex items-center gap-2">
              <Checkbox
                checked={subtask.done}
                onCheckedChange={(checked) => handleToggle(subtask.id, checked === true)}
              />
              <span className={`flex-1 text-sm ${subtask.done ? "text-muted-foreground line-through" : ""}`}>
                {subtask.title}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => handleDelete(subtask.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No subtasks yet.</p>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a subtask…"
          className="h-8"
        />
        <Button type="button" variant="outline" size="icon-sm" onClick={submitAdd} disabled={title.trim().length === 0}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}
