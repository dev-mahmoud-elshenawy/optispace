"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProfile, updateProfile } from "@/features/profiles/actions";
import { ProfileIcon } from "@/features/profiles/components/profile-icon";
import { PROFILE_ICON_KEYS, profileSchema, type ProfileIconKey } from "@/features/profiles/schema";
import type { ProfileView } from "@/features/profiles/service";

const ICON_LABELS: Record<ProfileIconKey, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  x: "X",
  medium: "Medium",
  npm: "npm",
  pubdev: "pub.dev",
  globe: "Website",
  mail: "Email",
};

interface ProfileFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileView | null;
}

export function ProfileFormDialog({ open, onOpenChange, profile }: ProfileFormDialogProps) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(profile?.label ?? "");
    setUrl(profile?.url ?? "");
    setUsername(profile?.username ?? "");
    setIcon(profile?.icon ?? undefined);
    setError(null);
  }, [open, profile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = profileSchema.safeParse({
      label,
      url,
      username: username || undefined,
      icon,
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
            <Input
              id="profile-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/you"
            />
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
          <div className="space-y-1.5">
            <Label htmlFor="profile-icon">Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger id="profile-icon" className="w-full">
                <SelectValue placeholder="Choose an icon" />
              </SelectTrigger>
              <SelectContent>
                {PROFILE_ICON_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    <ProfileIcon icon={key} className="size-4" />
                    {ICON_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
