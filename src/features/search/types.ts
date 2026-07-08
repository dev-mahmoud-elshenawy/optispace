export type SearchItemType = "Task" | "Project" | "Package" | "Profile";

export interface SearchItem {
  type: SearchItemType;
  label: string;
  href: string;
}
