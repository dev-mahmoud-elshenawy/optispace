"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5 font-heading text-lg font-bold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            O
          </span>
          <span className="text-gradient">OptiSpace</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
        </div>
      </div>
      <div className="px-3 pb-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("optispace:open-command"))}
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <SearchIcon className="h-4 w-4" />
          <span>Search…</span>
          <kbd className="ml-auto rounded border border-sidebar-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title ?? `group-${gi}`} className="flex flex-col gap-1">
            {group.title ? (
              <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.title}
              </span>
            ) : null}
            {group.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    active
                      ? "bg-primary/12 text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_10px] shadow-primary/60" />
                  ) : null}
                  <Icon className={cn("h-4 w-4 transition-colors", active ? "text-primary" : "group-hover:text-foreground")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="px-5 py-4 text-xs text-muted-foreground">Local-first · single user</div>
    </aside>
  );
}
