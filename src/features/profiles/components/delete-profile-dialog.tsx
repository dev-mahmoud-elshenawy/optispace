"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteProfile } from "@/features/profiles/actions";
import type { ProfileView } from "@/features/profiles/service";

interface DeleteProfileDialogProps {
  profile: ProfileView | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteProfileDialog({ profile, onOpenChange }: DeleteProfileDialogProps) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!profile) return;
    setPending(true);
    const result = await deleteProfile(profile.id);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Profile deleted");
    onOpenChange(false);
  }

  return (
    <Dialog open={profile !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete profile?</DialogTitle>
          <DialogDescription>
            {profile ? `"${profile.label}" will be removed. This can't be undone.` : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
