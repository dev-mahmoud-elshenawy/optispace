export type SearchItemType =
  | "Task"
  | "Project"
  | "Package"
  | "Profile"
  | "Leave"
  | "Notification"
  | "Milestone"
  | "Link"
  | "File"
  | "PullRequest"
  | "Feedback";

export interface SearchItem {
  type: SearchItemType;
  label: string;
  href: string;
  // Extra text the ⌘K palette matches on but doesn't display (task descriptions,
  // feedback authors, etc.) — enriches recall without cluttering the row.
  keywords?: string;
}
