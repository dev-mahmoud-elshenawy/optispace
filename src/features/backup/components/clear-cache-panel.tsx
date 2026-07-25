"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { clearPersistentCaches } from "@/lib/lru";

// Manual escape hatch for the browser-side view caches (task/PR details, diffs, timelines, lists).
// They self-bound (LRU + byte self-trim + 7-day TTL), so this is for freeing space on demand or
// wiping locally-stored work content — not something the app needs to call itself.
export function ClearCachePanel() {
  const [cleared, setCleared] = useState(false);

  function handleClear() {
    clearPersistentCaches();
    setCleared(true);
    toast.success("Cached view data cleared.");
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Cached view data</p>
          <p className="text-xs text-muted-foreground">
            Task &amp; PR details, code diffs and lists are cached in your browser so they load
            instantly and survive reloads. Cleared automatically after 7 days — clear it here to free
            space or wipe locally-stored work content now.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleClear} className="shrink-0">
          <Trash2 className="h-4 w-4" /> {cleared ? "Cleared" : "Clear cache"}
        </Button>
      </div>
    </Card>
  );
}
