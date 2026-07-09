import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, CalendarDays, Link2, ListChecks, GitBranch, Package, Archive, Settings, Bell } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// The sidebar renders from this list. New module => add one entry.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Annual Leave", href: "/leave", icon: CalendarDays },
  { label: "Profiles", href: "/profiles", icon: Link2 },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Development", href: "/projects", icon: GitBranch },
  { label: "Packages", href: "/packages", icon: Package },
  { label: "Archive", href: "/archive", icon: Archive },
  { label: "Settings", href: "/settings", icon: Settings },
];
