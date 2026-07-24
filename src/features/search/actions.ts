"use server";

import { getSearchIndex } from "./queries";
import type { SearchItem } from "./types";

// Lazy loader for the ⌘K palette. Keeps the 11-query index OUT of the root
// layout (which re-runs on every navigation + every router.refresh()); the
// palette fetches this only when opened.
export async function loadSearchIndex(): Promise<SearchItem[]> {
  return getSearchIndex();
}
