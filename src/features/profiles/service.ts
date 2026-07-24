import type { Profile } from "@prisma/client";
import type { ProfileIconKey } from "@/features/profiles/schema";

export type ProfileView = {
  id: string;
  label: string;
  url: string;
  username: string | null;
  icon: string | null;
  order: number;
};

// The platform logo is derived from the URL — no manual picker. Bare hostnames
// (no scheme) are tolerated so the live preview works while the user is typing.
export function detectProfileIcon(url: string): ProfileIconKey {
  const raw = url.trim().toLowerCase();
  if (raw.startsWith("mailto:")) return "mail";
  let host: string;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return "globe";
  }
  if (host === "github.com" || host.endsWith(".github.com") || host === "gist.github.com") return "github";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host === "medium.com" || host.endsWith(".medium.com")) return "medium";
  if (host === "npmjs.com" || host.endsWith(".npmjs.com")) return "npm";
  if (host === "pub.dev") return "pubdev";
  return "globe";
}

export function toProfileView(row: Profile): ProfileView {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    username: row.username,
    icon: detectProfileIcon(row.url),
    order: row.order,
  };
}
