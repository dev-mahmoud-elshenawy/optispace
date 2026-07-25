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
  currentCarryOver: number;
  prevYearRemaining: number;
}

export function AllowanceDialog({ year, currentDays, currentCarryOver, prevYearRemaining }: AllowanceDialogProps) {
  const [open, setOpen] = useState(false);
  const [totalDays, setTotalDays] = useState(String(currentDays));
  const [carryOver, setCarryOver] = useState(String(currentCarryOver));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const suggestedCarry = Math.max(0, Math.round(prevYearRemaining * 100) / 100);

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    setError(null);
    if (next) {
      setTotalDays(String(currentDays));
      setCarryOver(String(currentCarryOver));
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setError(null);
    const parsed = Number(totalDays);
    const parsedCarry = Number(carryOver);
    if (Number.isNaN(parsed) || Number.isNaN(parsedCarry)) {
      setError("Enter a valid number of days");
      return;
    }

    startTransition(async () => {
      const result = await setAllowance(year, parsed, parsedCarry);
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
            <DialogDescription>Annual leave days available this year, plus any carried over.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
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
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="carryOver">Carried over from {year - 1}</Label>
                {suggestedCarry > 0 ? (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setCarryOver(String(suggestedCarry))}
                  >
                    Use {suggestedCarry} unused
                  </button>
                ) : null}
              </div>
              <Input
                id="carryOver"
                type="number"
                min={0}
                step="0.5"
                value={carryOver}
                onChange={(e) => setCarryOver(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Added to the total — counts toward this year&apos;s allowance.</p>
            </div>
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
