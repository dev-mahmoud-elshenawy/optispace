"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addMilestone, deleteMilestone, toggleMilestone } from "../actions";
import type { MilestoneView } from "../service";

interface MilestoneChecklistProps {
  projectId: string;
  milestones: MilestoneView[];
}

export function MilestoneChecklist({ projectId, milestones }: MilestoneChecklistProps) {
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleToggle(id: string, done: boolean): void {
    startTransition(async () => {
      const result = await toggleMilestone(id, done);
      if (!result.ok) toast.error(result.error);
    });
  }

  function handleDelete(id: string): void {
    startTransition(async () => {
      const result = await deleteMilestone(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  function handleAdd(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await addMilestone(projectId, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTitle("");
    });
  }

  return (
    <div className="space-y-2">
      {milestones.length === 0 ? (
        <p className="text-xs text-muted-foreground">No milestones yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {milestones.map((milestone) => (
            <li key={milestone.id} className="group flex items-center gap-2">
              <Checkbox
                checked={milestone.done}
                onCheckedChange={(checked) => handleToggle(milestone.id, checked === true)}
                disabled={isPending}
              />
              <span
                className={`flex-1 text-sm ${milestone.done ? "text-muted-foreground line-through" : ""}`}
              >
                {milestone.title}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => handleDelete(milestone.id)}
                disabled={isPending}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex gap-1.5">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add milestone…"
          className="h-7 text-xs"
        />
        <Button type="submit" size="icon-sm" variant="outline" disabled={isPending}>
          <Plus />
        </Button>
      </form>
    </div>
  );
}
