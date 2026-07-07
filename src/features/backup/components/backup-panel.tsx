"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { importBackup } from "../actions";

export function BackupPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  function handleImport() {
    if (!selected) {
      inputRef.current?.click();
      return;
    }
    const formData = new FormData();
    formData.append("file", selected);
    startTransition(async () => {
      const result = await importBackup(formData);
      if (result.ok) {
        toast.success(`Restored ${result.restored} records.`);
        setSelected(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Download a full backup — every record plus uploaded project files — as a single JSON file.
          </p>
          <Button asChild>
            <a href="/api/backup" download>
              <Download className="h-4 w-4" />
              Download backup
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Restore from a backup file. Existing records with the same id are overwritten.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => setSelected(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
            {selected ? <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{selected.name}</span> : null}
            <Button variant="outline" onClick={handleImport} disabled={pending}>
              <Upload className="h-4 w-4" />
              {selected ? "Restore" : "Choose file"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
