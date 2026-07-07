export type ArchiveKind = "task" | "leave" | "project" | "package" | "profile" | "file" | "link" | "feedback";

export interface ArchivedItem {
  kind: ArchiveKind;
  id: string;
  label: string;
  deletedAt: Date;
}

const KIND_LABELS: Record<ArchiveKind, string> = {
  task: "Task",
  leave: "Leave",
  project: "Project",
  package: "Package",
  profile: "Profile",
  file: "File",
  link: "Link",
  feedback: "Feedback",
};

export function archiveKindLabel(kind: ArchiveKind): string {
  return KIND_LABELS[kind];
}
