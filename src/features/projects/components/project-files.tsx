"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, Upload, FileLock2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ProjectFileMeta } from "../service";
import { deleteProjectFile, uploadProjectFile } from "../actions";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ProjectFilesProps {
  projectId: string;
  files: ProjectFileMeta[];
}

export function ProjectFiles({ projectId, files }: ProjectFilesProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleUpload() {
    if (selected.length === 0) {
      inputRef.current?.click();
      return;
    }
    const formData = new FormData();
    formData.append("projectId", projectId);
    for (const file of selected) formData.append("file", file);
    startTransition(async () => {
      const result = await uploadProjectFile(formData);
      if (result.ok) {
        toast.success(`Uploaded ${selected.length} file${selected.length === 1 ? "" : "s"}.`);
        setSelected([]);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete(file: ProjectFileMeta) {
    setDeletingId(file.id);
    startTransition(async () => {
      const result = await deleteProjectFile(file.id);
      if (result.ok) {
        toast.success(`Removed ${file.name}. Restore it from Archive.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setDeletingId(null);
    });
  }

  return (
    <div className="space-y-2">
      {files.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">
          No files yet. Store .env, keystores, or prod configs here for reference.
        </p>
      ) : (
        <div className="space-y-0.5">
          {files.map((file) => (
            <div key={file.id} className="group/file flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
              <FileLock2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatSize(file.size)}</span>
              <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/file:opacity-100">
                <Button variant="ghost" size="icon-xs" asChild>
                  <a href={`/api/project-files?id=${file.id}`} download aria-label={`Download ${file.name}`}>
                    <Download />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleDelete(file)}
                  disabled={pending && deletingId === file.id}
                  aria-label={`Delete ${file.name}`}
                >
                  <Trash2 />
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => setSelected(Array.from(e.target.files ?? []))}
        />
        {selected.length > 0 ? (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {selected.length === 1 ? selected[0].name : `${selected.length} files selected`}
          </span>
        ) : null}
        <Button variant="outline" size="sm" onClick={handleUpload} disabled={pending}>
          <Upload className="h-3.5 w-3.5" />
          {selected.length > 0 ? "Upload" : "Add files"}
        </Button>
      </div>
    </div>
  );
}
