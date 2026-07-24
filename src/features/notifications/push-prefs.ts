import type { NotificationType } from "./service";

// Per-type desktop-push toggles. Desktop push is purely a browser concern (fired in
// NotificationBell from the Web Notifications API), so prefs live in localStorage — no
// DB/server round-trip. Missing/unknown types default to ENABLED.
const KEY = "optispace:pushPrefs";

export type PushPrefs = Partial<Record<NotificationType, boolean>>;

export function getPushPrefs(): PushPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PushPrefs) : {};
  } catch {
    return {};
  }
}

export function isPushEnabled(prefs: PushPrefs, type: NotificationType): boolean {
  return prefs[type] !== false; // default on — only an explicit false silences a type
}

export function setPushPref(type: NotificationType, enabled: boolean): PushPrefs {
  const next = { ...getPushPrefs(), [type]: enabled };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage disabled (private mode) — prefs just won't persist this session
    }
  }
  return next;
}
