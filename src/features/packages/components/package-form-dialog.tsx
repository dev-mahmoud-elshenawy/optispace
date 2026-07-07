"use client";

import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PACKAGE_REGISTRIES, PACKAGE_LANGUAGES, PACKAGE_STATUSES } from "@/types";
import type { PackageRegistry, PackageLanguage, PackageStatus } from "@/types";
import type { PackageView } from "../service";
import { createPackage, updatePackage } from "../actions";

interface PackageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PackageView | null;
  projectOptions: { id: string; name: string }[];
}

const REGISTRY_LABELS: Record<PackageRegistry, string> = { npm: "npm", pubdev: "pub.dev" };
const LANGUAGE_LABELS: Record<PackageLanguage, string> = {
  dart_flutter: "Dart / Flutter",
  js_react: "JS / React",
  js_react_native: "JS / React Native",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  registry: "npm" as PackageRegistry,
  registryUrl: "",
  githubUrl: "",
  language: "js_react" as PackageLanguage,
  currentVersion: "",
  tags: "",
  status: "active" as PackageStatus,
  projectId: "",
};

type FormState = typeof EMPTY_FORM;

function formFromPackage(pkg: PackageView): FormState {
  return {
    name: pkg.name,
    description: pkg.description ?? "",
    registry: pkg.registry,
    registryUrl: pkg.registryUrl ?? "",
    githubUrl: pkg.githubUrl ?? "",
    language: pkg.language,
    currentVersion: pkg.currentVersion ?? "",
    tags: pkg.tags.join(", "),
    status: pkg.status,
    projectId: pkg.projectId ?? "",
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function PackageFormDialog({ open, onOpenChange, editing, projectOptions }: PackageFormDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (open) setForm(editing ? formFromPackage(editing) : EMPTY_FORM);
  }, [open, editing]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input = {
      name: form.name,
      description: form.description || undefined,
      registry: form.registry,
      registryUrl: form.registryUrl || undefined,
      githubUrl: form.githubUrl || undefined,
      language: form.language,
      currentVersion: form.currentVersion || undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      status: form.status,
      projectId: form.projectId || undefined,
    };

    startTransition(async () => {
      const result = editing ? await updatePackage(editing.id, input) : await createPackage(input);
      if (result.ok) {
        toast.success(editing ? "Package updated." : "Package added.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit package" : "Add package"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Name (exact package slug)">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. react-query" required />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <Select value={form.registry} onValueChange={(v) => set("registry", v as PackageRegistry)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACKAGE_REGISTRIES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {REGISTRY_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Language">
              <Select value={form.language} onValueChange={(v) => set("language", v as PackageLanguage)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACKAGE_LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LANGUAGE_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source URL">
              <Input value={form.registryUrl} onChange={(e) => set("registryUrl", e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="GitHub URL">
              <Input value={form.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} placeholder="https://…" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current version">
              <Input value={form.currentVersion} onChange={(e) => set("currentVersion", e.target.value)} placeholder="1.0.0" />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v as PackageStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACKAGE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Tags (comma separated)">
            <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="state, cache" />
          </Field>
          <Field label="Project">
            <Select value={form.projectId || "none"} onValueChange={(v) => set("projectId", v === "none" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
