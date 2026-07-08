import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MODULES: { key: string; label: string }[] = [
  { key: "tasks", label: "Tasks" },
  { key: "packages", label: "Packages" },
  { key: "profiles", label: "Profiles" },
  { key: "leaves", label: "Annual Leave" },
  { key: "projects", label: "Projects" },
];

export function ExportPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Export data</CardTitle>
        <CardDescription>Download a single module as CSV (spreadsheet-friendly) or JSON.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {MODULES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-sm">{label}</span>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`/api/export?module=${key}&format=csv`} download>
                  <Download /> CSV
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/export?module=${key}&format=json`} download>
                  <Download /> JSON
                </a>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
