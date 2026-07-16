export type SearchItemType =
  | "Task"
  | "Project"
  | "Package"
  | "Profile"
  | "Leave"
  | "Notification"
  | "Milestone"
  | "Link"
  | "File";

export interface SearchItem {
  type: SearchItemType;
  label: string;
  href: string;
}
