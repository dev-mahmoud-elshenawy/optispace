"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProfile, updateProfile } from "@/features/profiles/actions";
import { ProfileIcon } from "@/features/profiles/components/profile-icon";
import { profileSchema } from "@/features/profiles/schema";
import { detectProfileIcon, type ProfileView } from "@/features/profiles/service";

interface ProfileFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileView | null;
}

export function ProfileFormDialog({ open, onOpenChange, profile }: ProfileFormDialogProps) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(profile?.label ?? "");
    setUrl(profile?.url ?? "");
    setUsername(profile?.username ?? "");
    setError(null);
  }, [open, profile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Icon is derived from the URL at read time (see toProfileView) — nothing to submit.
    const parsed = profileSchema.safeParse({
      label,
      url,
      username: username || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setPending(true);
    setError(null);
    const result = profile ? await updateProfile(profile.id, parsed.data) : await createProfile(parsed.data);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success(profile ? "Profile updated" : "Profile added");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{profile ? "Edit profile" : "Add profile"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="profile-label">Label</Label>
            <Input id="profile-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="GitHub" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-url">URL</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <ProfileIcon icon={detectProfileIcon(url)} className="size-4" />
              </span>
              <Input
                id="profile-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/you"
                className="pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">The platform logo is detected automatically from the link.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-username">Username</Label>
            <Input
              id="profile-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="you"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
