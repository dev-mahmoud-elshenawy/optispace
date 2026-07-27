"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// Two-key "g <key>" navigation (GitHub/Linear style). Press g, then a letter within
// the window below, to jump to that page. Skipped while typing in a field or when a
// modifier is held (so ⌘K and browser shortcuts still work).
const GO_ROUTES: Record<string, string> = {
  d: "/", // Dashboard
  c: "/calendar",
  n: "/notifications",
  t: "/tasks",
  p: "/projects", // Development
  r: "/pull-requests",
  m: "/team", // members

  k: "/packages",
  l: "/leave",
  f: "/profiles",
  a: "/archive",
  s: "/settings",
};

const SEQUENCE_MS = 1000; // how long "g" stays armed for the second key

// Bare "c" (not part of a "g c" sequence) opens the create flow on these pages via ?new=1.
const CREATE_ROUTES: Record<string, string> = {
  "/tasks": "/tasks?new=1",
  "/projects": "/projects?new=1",
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const armedAt = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;

      if (e.key === "g") {
        armedAt.current = e.timeStamp;
        return;
      }

      const armed = armedAt.current !== 0 && e.timeStamp - armedAt.current <= SEQUENCE_MS;
      armedAt.current = 0;

      if (armed) {
        const href = GO_ROUTES[e.key.toLowerCase()];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }

      // Bare "c" — create on the current page.
      if (e.key.toLowerCase() === "c") {
        const createHref = CREATE_ROUTES[pathname];
        if (createHref) {
          e.preventDefault();
          router.push(createHref);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router, pathname]);

  return null;
}
