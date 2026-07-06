import { z } from "zod";

// Supported icon keys for the profile Select field. Unknown/legacy values still
// render via the ProfileIcon fallback, so this list only bounds the picker UI.
export const PROFILE_ICON_KEYS = ["github", "linkedin", "x", "medium", "npm", "pubdev", "globe", "mail"] as const;
export type ProfileIconKey = (typeof PROFILE_ICON_KEYS)[number];

export const profileSchema = z.object({
  label: z.string().min(1, "Label is required"),
  url: z.string().url("Enter a valid URL"),
  username: z.string().optional(),
  icon: z.enum(PROFILE_ICON_KEYS).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
