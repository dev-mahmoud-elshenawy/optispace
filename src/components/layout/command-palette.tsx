"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { NAV_ITEMS } from "@/lib/nav";
import type { SearchItem, SearchItemType } from "@/features/search/types";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const GROUP_ORDER: SearchItemType[] = ["Task", "Project", "Package", "Profile"];

export function CommandPalette({ items = [] }: { items?: SearchItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("optispace:open-command", onOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("optispace:open-command", onOpen);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, tasks, projects, packages…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.href} value={`${item.label} page`} onSelect={() => go(item.href)}>
                <Icon />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        {GROUP_ORDER.map((type) => {
          const group = items.filter((it) => it.type === type);
          if (group.length === 0) return null;
          return (
            <CommandGroup key={type} heading={`${type}s`}>
              {group.map((it, i) => (
                <CommandItem key={`${type}-${i}`} value={`${it.label} ${type}`} onSelect={() => go(it.href)}>
                  <span className="truncate">{it.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{type}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
