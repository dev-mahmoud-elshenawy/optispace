// Shared enum-like unions — single source of truth for the String columns in schema.prisma.
// Zod schemas (each feature's schema.ts) validate against these; components render from them.

export const LEAVE_TYPES = ["annual"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];


export const PROJECT_PLATFORMS = ["flutter", "react_native", "web", "backend"] as const;
export type ProjectPlatform = (typeof PROJECT_PLATFORMS)[number];

export const PROJECT_STATUSES = ["planning", "active", "paused", "completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PACKAGE_REGISTRIES = ["npm", "pubdev"] as const;
export type PackageRegistry = (typeof PACKAGE_REGISTRIES)[number];

export const PACKAGE_LANGUAGES = ["dart_flutter", "js_react", "js_react_native"] as const;
export type PackageLanguage = (typeof PACKAGE_LANGUAGES)[number];

export const PACKAGE_STATUSES = ["active", "maintenance", "deprecated"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

// Tags are stored as a JSON string in SQLite. Parse/serialize at the service boundary.
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags.map((t) => t.trim()).filter(Boolean));
}
