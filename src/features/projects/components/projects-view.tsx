"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectStatus } from "@/types";
import type { TaskView } from "@/features/tasks/service";
import { compareProjectsForOrder, PROJECT_STATUS_LABELS } from "../service";
import type { ProjectFeedbackItem, ProjectFileMeta, ProjectLinkItem, ProjectView } from "../service";
import { reorderProjects } from "../actions";
import { ProjectCard } from "./project-card";

// Static, always-the-same filter options (display order) — no waiting on data to
// compute which statuses are present.
const STATUS_OPTIONS: ProjectStatus[] = ["active", "production", "paused", "planning", "completed"];

interface ProjectItem {
  project: ProjectView;
  tasks: TaskView[];
  files: ProjectFileMeta[];
  links: ProjectLinkItem[];
  feedback: ProjectFeedbackItem[];
}

interface ProjectsViewProps {
  items: ProjectItem[];
  projectOptions: { id: string; name: string }[];
}

const ALL = "all";

// Sortable wrapper — the whole card is the drop target, but only the grip handle starts a
// drag, so the card's own buttons/links stay clickable.
function SortableProjectCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="group/sortable relative"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        title="Drag to reorder within this status"
        className="absolute left-1.5 top-1.5 z-10 cursor-grab touch-none rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/sortable:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      {children}
    </div>
  );
}

export function ProjectsView({ items: initialItems, projectOptions }: ProjectsViewProps) {
  const [status, setStatus] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  // Own the list so an edit (status change) or a drag re-sorts instantly, instead of
  // waiting for a server round-trip — the card's local badge update alone didn't reorder.
  const [items, setItems] = useState(initialItems);
  useEffect(() => setItems(initialItems), [initialItems]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Title-only search (project name), combined with the status filter — matches the
  // app convention that text search matches the name, not tags/other fields.
  const query = search.trim().toLowerCase();
  const filtered = items
    .filter(
      (it) =>
        (status === ALL || it.project.status === status) &&
        (query === "" || it.project.name.toLowerCase().includes(query)),
    )
    // The single shared ordering (bookmarked → status → manual drag order → name) — identical
    // to the Tasks by-project/by-sprint views, so they never diverge.
    .sort((a, b) => compareProjectsForOrder(a.project, b.project));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeItem = items.find((i) => i.project.id === active.id);
    const overItem = items.find((i) => i.project.id === over.id);
    // Drag only reorders within one status band — status is the primary sort key, so a
    // cross-status drop would just snap back. Ignore it.
    if (!activeItem || !overItem || activeItem.project.status !== overItem.project.status) return;

    const bandIds = filtered.filter((i) => i.project.status === activeItem.project.status).map((i) => i.project.id);
    const from = bandIds.indexOf(active.id as string);
    const to = bandIds.indexOf(over.id as string);
    if (from === -1 || to === -1) return;
    const newIds = arrayMove(bandIds, from, to);

    // Optimistic: assign sortWeight = new index within the band (mirrors reorderProjects).
    setItems((prev) =>
      prev.map((i) => {
        const idx = newIds.indexOf(i.project.id);
        return idx === -1 ? i : { ...i, project: { ...i.project, sortWeight: idx } };
      }),
    );
    void reorderProjects(newIds);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="h-8 w-full sm:w-64"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} project{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filtered.map((it) => it.project.id)} strategy={rectSortingStrategy}>
          <div className="grid gap-6 sm:grid-cols-2">
            {filtered.map((it) => (
              <SortableProjectCard key={it.project.id} id={it.project.id}>
                <ProjectCard
                  project={it.project}
                  tasks={it.tasks}
                  files={it.files}
                  links={it.links}
                  feedback={it.feedback}
                  projectOptions={projectOptions}
                  onProjectSaved={(vals) =>
                    setItems((prev) =>
                      prev.map((p) => (p.project.id === it.project.id ? { ...p, project: { ...p.project, ...vals } } : p)),
                    )
                  }
                />
              </SortableProjectCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
