import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, CalendarDays, Link2, ListChecks, GitBranch, Package, Archive, Settings, Bell } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title?: string; // section header (omitted for the top group)
  items: NavItem[];
}

// The sidebar renders these grouped sections. New module => add one entry to the
// right group. Grouped by intent: overview, work, personal, system.
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    title: "Work",
    items: [
      { label: "Tasks", href: "/tasks", icon: ListChecks },
      { label: "Development", href: "/projects", icon: GitBranch },
      { label: "Packages", href: "/packages", icon: Package },
    ],
  },
  {
    title: "Personal",
    items: [
      { label: "Annual Leave", href: "/leave", icon: CalendarDays },
      { label: "Profiles", href: "/profiles", icon: Link2 },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Archive", href: "/archive", icon: Archive },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

// Flat list (used by the ⌘K command palette). Derived from the groups.
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
