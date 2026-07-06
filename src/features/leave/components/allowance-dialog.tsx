"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAllowance } from "../actions";

interface AllowanceDialogProps {
  year: number;
  currentDays: number;
}

export function AllowanceDialog({ year, currentDays }: AllowanceDialogProps) {
  const [open, setOpen] = useState(false);
  const [totalDays, setTotalDays] = useState(String(currentDays));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    setError(null);
    if (next) setTotalDays(String(currentDays));
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setError(null);
    const parsed = Number(totalDays);
    if (Number.isNaN(parsed)) {
      setError("Enter a valid number of days");
      return;
    }

    startTransition(async () => {
      const result = await setAllowance(year, parsed);
      if (result.ok) {
        toast.success("Allowance saved");
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Set allowance</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Set allowance for {year}</DialogTitle>
            <DialogDescription>Total annual leave days available for this year.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label htmlFor="totalDays">Total days</Label>
            <Input
              id="totalDays"
              type="number"
              min={0}
              step="0.5"
              value={totalDays}
              onChange={(e) => setTotalDays(e.target.value)}
              required
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
