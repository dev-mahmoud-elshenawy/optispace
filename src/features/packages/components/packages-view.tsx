"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package as PackageIcon, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PACKAGE_REGISTRIES, PACKAGE_LANGUAGES } from "@/types";
import type { PackageRegistry, PackageLanguage } from "@/types";
import type { PackageView } from "../service";
import { refreshAllStats } from "../actions";
import { PackageCard } from "./package-card";
import { PackageFormDialog } from "./package-form-dialog";

interface PackagesViewProps {
  packages: PackageView[];
  projectOptions: { id: string; name: string }[];
}

const REGISTRY_LABELS: Record<PackageRegistry, string> = { npm: "npm", pubdev: "pub.dev" };
const LANGUAGE_LABELS: Record<PackageLanguage, string> = {
  dart_flutter: "Dart / Flutter",
  js_react: "JS / React",
  js_react_native: "JS / React Native",
};

export function PackagesView({ packages, projectOptions }: PackagesViewProps) {
  const router = useRouter();
  const [isRefreshingAll, startRefreshAll] = useTransition();
  const [registryFilter, setRegistryFilter] = useState<PackageRegistry | "all">("all");
  const [languageFilter, setLanguageFilter] = useState<PackageLanguage | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PackageView | null>(null);

  const filtered = useMemo(
    () =>
      packages.filter(
        (pkg) => (registryFilter === "all" || pkg.registry === registryFilter) && (languageFilter === "all" || pkg.language === languageFilter),
      ),
    [packages, registryFilter, languageFilter],
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(pkg: PackageView) {
    setEditing(pkg);
    setFormOpen(true);
  }

  function handleRefreshAll() {
    startRefreshAll(async () => {
      const result = await refreshAllStats();
      if (result.ok) toast.success("Refreshed all package stats.");
      else toast.error(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={registryFilter} onValueChange={(v) => setRegistryFilter(v as PackageRegistry | "all")}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Registry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All registries</SelectItem>
              {PACKAGE_REGISTRIES.map((r) => (
                <SelectItem key={r} value={r}>
                  {REGISTRY_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={languageFilter} onValueChange={(v) => setLanguageFilter(v as PackageLanguage | "all")}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {PACKAGE_LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={isRefreshingAll || packages.length === 0}>
            <RefreshCw className={cn(isRefreshingAll && "animate-spin")} />
            Refresh all stats
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus />
            Add package
          </Button>
        </div>
      </div>

      {packages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <PackageIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No packages yet — add your first one.</p>
          <Button size="sm" onClick={openCreate}>
            <Plus />
            Add package
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No packages match these filters.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} onEdit={openEdit} />
          ))}
        </div>
      )}

      <PackageFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} projectOptions={projectOptions} />
    </div>
  );
}
