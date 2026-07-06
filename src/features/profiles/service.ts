import type { Profile } from "@prisma/client";

export type ProfileView = {
  id: string;
  label: string;
  url: string;
  username: string | null;
  icon: string | null;
  order: number;
};

export function toProfileView(row: Profile): ProfileView {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    username: row.username,
    icon: row.icon,
    order: row.order,
  };
}
