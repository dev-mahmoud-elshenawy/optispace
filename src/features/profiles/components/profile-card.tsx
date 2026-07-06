"use client";

import { ExternalLink, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileIcon } from "@/features/profiles/components/profile-icon";
import type { ProfileView } from "@/features/profiles/service";

interface ProfileCardProps {
  profile: ProfileView;
  onEdit: (profile: ProfileView) => void;
  onDelete: (profile: ProfileView) => void;
}

export function ProfileCard({ profile, onEdit, onDelete }: ProfileCardProps) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <ProfileIcon icon={profile.icon} className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{profile.label}</p>
              {profile.username ? (
                <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
              ) : null}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreVertical />
                <span className="sr-only">Profile actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(profile)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(profile)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full">
          <a href={profile.url} target="_blank" rel="noreferrer">
            Open <ExternalLink />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
