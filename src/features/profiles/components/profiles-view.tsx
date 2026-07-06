"use client";

import { useState } from "react";
import { Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteProfileDialog } from "@/features/profiles/components/delete-profile-dialog";
import { ProfileCard } from "@/features/profiles/components/profile-card";
import { ProfileFormDialog } from "@/features/profiles/components/profile-form-dialog";
import type { ProfileView } from "@/features/profiles/service";

interface ProfilesViewProps {
  profiles: ProfileView[];
}

export function ProfilesView({ profiles }: ProfilesViewProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileView | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<ProfileView | null>(null);

  function openAdd() {
    setEditingProfile(null);
    setFormOpen(true);
  }

  function openEdit(profile: ProfileView) {
    setEditingProfile(profile);
    setFormOpen(true);
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openAdd}>
          <Plus /> Add profile
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Link2 className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No profiles yet — add your first link</p>
          <Button onClick={openAdd}>
            <Plus /> Add profile
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} onEdit={openEdit} onDelete={setDeletingProfile} />
          ))}
        </div>
      )}

      <ProfileFormDialog open={formOpen} onOpenChange={setFormOpen} profile={editingProfile} />
      <DeleteProfileDialog profile={deletingProfile} onOpenChange={(open) => !open && setDeletingProfile(null)} />
    </div>
  );
}
