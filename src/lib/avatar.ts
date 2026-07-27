// Deterministic per-name avatar tint, shared by every initial-avatar in the app (ADO task
// history, GitHub PR authors/reviewers, team members) so the same person is always the same
// colour. This was copy-pasted in three components before it lived here.
const AVATAR_COLORS = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
