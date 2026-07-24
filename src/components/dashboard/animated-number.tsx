"use client";

import { useEffect, useState } from "react";

// Counts up from 0 to `value` on mount (ease-out). SSR renders the final value so there's
// no hydration mismatch and no layout shift; the animation kicks in after hydration.
// Respects prefers-reduced-motion (shows the final value immediately).
export function AnimatedNumber({ value, durationMs = 900 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value === 0) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className="tabular-nums">{display.toLocaleString()}</span>;
}
