# Execution Plan — Azure DevOps Notifications (list + dashboard + desktop push)

> **For the executing agent (Sonnet):** This is a complete, self-contained spec. Read it top
> to bottom, then implement phase by phase. Every file path, reuse point, and gotcha you need
> is here. Follow the project conventions in `AGENTS.md`. Do NOT skip the "Gotchas" section —
> two of them will waste an hour each if you miss them.

## Goal

When someone in Azure DevOps **assigns a work item to me** or **@mentions me in a comment**, I
want to *notice it* inside OptiSpace (the Outlook emails get lost). Deliver:

1. A **notifications list** — a dedicated `/notifications` page.
2. A **dashboard widget** — recent unread notifications on the home page.
3. **Desktop push** — a browser Web Notifications popup that fires while the app/dev server is
   open, even when the tab is backgrounded, so I actually notice.
4. Detection of **assignments** (reliable) and **mentions** (best-effort, bounded).

## Constraints / design decisions (already decided — do not re-litigate)

- **Local-first, single-user.** "Real-time" = "noticed within the poll interval while the app is
  open." No webhooks, no tunnel, no daemon.
- **Detection runs server-side inside the existing `syncAzureDevOps()`** (which already polls
  every 10 min via `AzureDevOpsAutoSync`). Do NOT add a second server poller.
- **Desktop popup is client-only** (browser API), fired by a client component that polls a
  notification feed action.
- **Dedup via a unique `dedupeKey` column** — NOT a watermark table. Re-scanning the same
  comment/assignment hits the unique constraint and is ignored (`upsert` with empty `update`).
- **"Me" identity** comes from `AZURE_DEVOPS_EMAIL` (confirmed present in `.env`), resolved to an
  identity GUID once per sync via the existing `searchIdentities()`.
- Follow every `AGENTS.md` convention: feature-module split, `server-only` on queries, soft delete
  everywhere, Server Actions return `{ ok } | { ok:false, error }`, UTC storage.

---

## Existing code map (what to reuse — READ THESE FIRST)

### `src/features/integrations/azure-devops/service.ts` (`import "server-only"`)
- `getAzureDevOpsConfig(): AzureDevOpsConfig | null` → `{ orgUrl, pat, email, projects, includeDone }`.
- `authHeaders(pat)` — private; Basic auth header. `const API = "api-version=7.0"`.
- `WorkItemDTO` — now has: `externalId, title, description, status, url, project, iterationPath,
  effort, changedDate`. (`changedDate` is an ISO string on the DTO.)
- `fetchAssignedWorkItems(config)` → `{ items: WorkItemDTO[], openIds: string[], doneIds: string[] }`.
  WIQL is `[System.AssignedTo] = @Me ... ORDER BY [System.ChangedDate] DESC`, capped at 200.
- `searchIdentities(query): Promise<AdoIdentity[]>` → `{ id (GUID), displayName, mail }[]`. Use
  `searchIdentities(config.email)` and match `mail === config.email` (case-insensitive) to get
  **my GUID**.
- `sanitizeHtml(html)` — **STRIPS `data-vss-mention`** (only allows `href, title` attrs). ⚠️ Do NOT
  use sanitized comment text for mention detection — the GUID is gone. Use RAW comment HTML.
- Comments API shape (see `fetchWorkItemDetail`): `GET
  ${orgUrl}/${project}/_apis/wit/workItems/${id}/comments?api-version=7.1-preview.4` →
  `{ comments: [{ id, text, createdBy: { displayName }, createdDate }] }`. `text` is HTML and
  contains `<a data-vss-mention="version:2.0,{GUID}">@Name</a>` for mentions.

### `src/features/integrations/azure-devops/actions.ts` (`"use server"`)
- `syncAzureDevOps()` — the poller target. Loop over `items`: `db.task.findUnique` by
  `source_externalId`; if `existing` → `update`; else → `create` (this branch = **newly assigned to
  me**). Tracks `imported/updated/pruned`. This is where assignment events originate.

### `src/features/integrations/azure-devops/types.ts` (client-safe, no `server-only`)
- `AdoIdentity { id, displayName, mail }`. Add any new client-shared types here.

### `src/features/integrations/azure-devops/auto-sync.tsx` (`"use client"`)
- `AzureDevOpsAutoSync({ enabled })` — mounted in root layout; runs `syncAzureDevOps()` on mount +
  every `INTERVAL_MS = 10 * 60 * 1000`. `router.refresh()` on change.

### `src/app/layout.tsx` — mounts `<Sidebar/>`, `<AzureDevOpsAutoSync enabled={isAzureDevOpsEnabled()} />`,
`<Toaster/>`. Add the notification watcher/bell here or in the sidebar.

### `src/components/layout/sidebar.tsx` (`"use client"`) — renders `NAV_ITEMS` from `src/lib/nav.ts`.
Bell goes here (near the search button / header row at top).

### `src/lib/nav.ts` — `NAV_ITEMS: NavItem[]`. Add one entry for `/notifications` (icon `Bell`).

### `src/app/page.tsx` — dashboard server component (`export const dynamic = "force-dynamic"`).
Uses `Card/CardHeader/CardTitle/CardContent`, `IconChip`, `ViewAllLink`. Add a notifications card.

### Task detail modal (for deep-linking a notification → open the work item)
- `src/features/tasks/components/tasks-view.tsx` opens `AzureDevOpsTaskDetail` by `externalId`. For
  the notifications page/dashboard, the simplest deep-link is the ADO `url` (opens in ADO) OR route
  to `/tasks` and let the user click. **Keep it simple: link each notification to its ADO `url` in a
  new tab.** (Opening the in-app modal from `/notifications` would require lifting the modal — out of
  scope; use the ADO url.)

---

## Gotchas (do not skip)

1. **GateGuard fact-forcing hook.** The FIRST edit/write to any file this session is blocked by a
   hook demanding you state: importers/callers, affected API, data schemas, and the user's verbatim
   instruction. Just print those 4 facts, then retry the exact same edit. It's not an error.
2. **Stale dev server after a migration.** Prisma caches the generated client in the running
   `npm run dev` process. After `npx prisma migrate dev`, the running server throws
   `Unknown argument 'X'` until restarted. **Kill and restart `npm run dev` after the migration.**
   (Build/tsc will pass while the running server still fails — trust the restart, not the build.)
3. **`sanitizeHtml` strips `data-vss-mention`.** Mention detection MUST read the RAW comment HTML.
   Write a dedicated raw-comment fetch; do not route detection through `sanitizeHtml`.
4. **SQLite `createMany` has no `skipDuplicates`.** Dedup via `upsert({ where:{dedupeKey}, create, update:{} })`
   per event (insert-or-ignore).
5. **First-run mention flood.** The first sync after this ships will "update" many tasks (because
   `effort`/`changedDate` newly populate). Bound mention detection to comments created within
   `MENTION_LOOKBACK_DAYS` (14) so ancient mentions never notify. Assignments do NOT flood — existing
   synced tasks are found as `existing` and only genuinely-new items hit the `create` branch.
6. **Multiple lockfiles warning** at repo root is pre-existing and harmless — ignore.

---

## Phase 1 — Schema + notifications feature module

### 1a. Prisma model — `prisma/schema.prisma`
Add after the `Subtask` model:

```prisma
model Notification {
  id          String    @id @default(cuid())
  type        String    // "assigned" | "mentioned"
  externalId  String    // ADO work item id
  title       String    // work item title (for display)
  url         String    // deep link to the ADO work item
  message     String?   // e.g. "Assigned to you" or a comment snippet
  dedupeKey   String    @unique // "assigned:{externalId}" | "mention:{externalId}:{commentId}"
  readAt      DateTime?
  notifiedAt  DateTime? // set once the browser desktop popup has fired
  createdAt   DateTime  @default(now())
  deletedAt   DateTime?

  @@index([readAt])
  @@index([createdAt])
}
```

Then:
```bash
npx prisma migrate dev --name add_notifications
```
**Then restart `npm run dev`** (Gotcha #2).

### 1b. `src/features/notifications/service.ts` (NO `server-only` — shared types/mappers)
```ts
import type { Notification } from "@prisma/client";

export type NotificationType = "assigned" | "mentioned";

export interface NotificationView {
  id: string;
  type: NotificationType;
  externalId: string;
  title: string;
  url: string;
  message: string | null;
  read: boolean;
  createdAt: Date;
}

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  assigned: "Assigned to you",
  mentioned: "Mentioned you",
};

export function toNotificationView(row: Notification): NotificationView {
  return {
    id: row.id,
    type: row.type as NotificationType,
    externalId: row.externalId,
    title: row.title,
    url: row.url,
    message: row.message,
    read: row.readAt != null,
    createdAt: row.createdAt,
  };
}

// The event shape the sync produces; recordNotifications() persists these.
export interface NotificationEvent {
  type: NotificationType;
  externalId: string;
  title: string;
  url: string;
  message: string;
  dedupeKey: string;
}
```

### 1c. `src/features/notifications/queries.ts` (`import "server-only"`)
```ts
import "server-only";
import { db } from "@/lib/db";
import { toNotificationView, type NotificationView } from "./service";

export async function listNotifications(limit = 50): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toNotificationView);
}

export async function unreadNotificationCount(): Promise<number> {
  return db.notification.count({ where: { deletedAt: null, readAt: null } });
}

export async function recentNotifications(limit = 5): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: { deletedAt: null, readAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toNotificationView);
}
```

### 1d. `src/features/notifications/actions.ts` (`"use server"`)
```ts
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { toNotificationView, type NotificationEvent, type NotificationView } from "./service";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Called by the ADO sync. Insert-or-ignore by dedupeKey (SQLite-safe; Gotcha #4).
export async function recordNotifications(events: NotificationEvent[]): Promise<void> {
  for (const e of events) {
    await db.notification.upsert({
      where: { dedupeKey: e.dedupeKey },
      create: {
        type: e.type,
        externalId: e.externalId,
        title: e.title,
        url: e.url,
        message: e.message,
        dedupeKey: e.dedupeKey,
      },
      update: {}, // already exists → do nothing
    });
  }
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  revalidatePath("/");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  await db.notification.updateMany({
    where: { deletedAt: null, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/");
  return { ok: true };
}

export async function dismissNotification(id: string): Promise<ActionResult> {
  await db.notification.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/notifications");
  revalidatePath("/");
  return { ok: true };
}

// Client feed for the bell + desktop push. Returns unread count, recent list, and the
// rows whose desktop popup hasn't fired yet (then marks them notified in the same call).
export interface NotificationFeed {
  unread: number;
  recent: NotificationView[];
  toPush: NotificationView[];
}

export async function pollNotificationFeed(): Promise<NotificationFeed> {
  const [unread, recentRows, pushRows] = await Promise.all([
    db.notification.count({ where: { deletedAt: null, readAt: null } }),
    db.notification.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.notification.findMany({ where: { deletedAt: null, notifiedAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  if (pushRows.length > 0) {
    await db.notification.updateMany({
      where: { id: { in: pushRows.map((r) => r.id) } },
      data: { notifiedAt: new Date() },
    });
  }
  return {
    unread,
    recent: recentRows.map(toNotificationView),
    toPush: pushRows.map(toNotificationView),
  };
}
```

> Note: `pollNotificationFeed` marks rows notified as a side effect so the desktop popup fires
> exactly once. This is intentional and safe for a single-user local app.

---

## Phase 2 — Detection inside the ADO sync

### 2a. Raw comments fetch — add to `azure-devops/service.ts`
```ts
export interface RawComment {
  id: number;
  textRaw: string; // UNsanitized HTML — needed to find data-vss-mention GUIDs
  createdDate: string | null;
}

export async function fetchRawComments(project: string, externalId: string): Promise<RawComment[]> {
  const config = getAzureDevOpsConfig();
  if (!config) return [];
  const res = await fetch(
    `${config.orgUrl}/${encodeURIComponent(project)}/_apis/wit/workItems/${encodeURIComponent(externalId)}/comments?api-version=7.1-preview.4`,
    { headers: authHeaders(config.pat) },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as {
    comments?: { id?: number; text?: string; createdDate?: string }[];
  };
  return (body.comments ?? []).map((c) => ({
    id: c.id ?? 0,
    textRaw: c.text ?? "",
    createdDate: c.createdDate ?? null,
  }));
}

// Resolve my ADO identity GUID from the configured email (for mention matching).
export async function resolveMyIdentityId(): Promise<string | null> {
  const config = getAzureDevOpsConfig();
  if (!config?.email) return null;
  const matches = await searchIdentities(config.email);
  const me = matches.find((m) => m.mail.toLowerCase() === config.email!.toLowerCase()) ?? matches[0];
  return me?.id ?? null;
}
```

### 2b. Wire detection into `syncAzureDevOps()` (`azure-devops/actions.ts`)

Add a constant near the top of the file:
```ts
const MENTION_LOOKBACK_DAYS = 14; // only notify for comments newer than this (Gotcha #5)
```

Import the new helpers + the recorder:
```ts
import { fetchRawComments, resolveMyIdentityId /* + existing */ } from "./service";
import { recordNotifications } from "@/features/notifications/actions";
import type { NotificationEvent } from "@/features/notifications/service";
```

Collect events during the upsert loop:
- In the **`create` branch** (newly assigned to me), push:
  ```ts
  events.push({
    type: "assigned",
    externalId: item.externalId,
    title: item.title,
    url: item.url,
    message: "Assigned to you",
    dedupeKey: `assigned:${item.externalId}`,
  });
  ```
- **Mentions:** after the loop, resolve my GUID once (`const myId = await resolveMyIdentityId()`).
  If `myId`, for each `item` whose `changedDate` is within the lookback window, fetch raw comments
  and, for each comment created within the window whose `textRaw` contains
  `data-vss-mention="version:2.0,${myId}"` (case-insensitive substring is fine), push:
  ```ts
  events.push({
    type: "mentioned",
    externalId: item.externalId,
    title: item.title,
    url: item.url,
    message: stripHtmlToSnippet(comment.textRaw), // strip tags, trim to ~140 chars
    dedupeKey: `mention:${item.externalId}:${comment.id}`,
  });
  ```
  Add a tiny local `stripHtmlToSnippet(html)` helper (`html.replace(/<[^>]*>/g, "").trim().slice(0, 140)`).

  **Bound the work:** only fetch comments for items with a recent `changedDate`
  (`Date.now() - new Date(item.changedDate).getTime() < MENTION_LOOKBACK_DAYS * 86_400_000`).
  Guard the whole mention block in `try/catch` per item — a failed comment fetch must not abort the
  sync (log, continue).

- After collecting, call `await recordNotifications(events)` (before the `revalidatePath` calls).
  Also `revalidatePath("/notifications")` when `events.length > 0`.

> **Assignment reliability:** the `create` branch fires only for work items new to my `@Me` set —
> this covers both brand-new items and items reassigned *to* me. Existing items found as `existing`
> never re-fire (no flood).

---

## Phase 3 — Desktop push + sidebar bell

### 3a. `src/features/notifications/components/notification-bell.tsx` (`"use client"`)
A single component (mount in the sidebar) that owns polling, the badge, the dropdown, AND desktop push.

Behavior:
- On mount: `if ("Notification" in window && Notification.permission === "default") Notification.requestPermission()`.
- Poll `pollNotificationFeed()` on mount + every `60_000ms` (`setInterval`, cleared on unmount).
- Render a bell button (lucide `Bell`) with an unread-count badge (hide if 0).
- Click → dropdown listing `feed.recent` (title + label + relative time). Each row links to its ADO
  `url` (`target="_blank"`) and calls `markNotificationRead(id)` on click. Include a "Mark all read"
  action (`markAllNotificationsRead`) and a "View all" link to `/notifications`.
- For each row in `feed.toPush`, if `Notification.permission === "granted"`, fire:
  ```ts
  const n = new Notification(NOTIFICATION_LABELS[row.type], { body: row.title, tag: row.id });
  n.onclick = () => { window.focus(); window.open(row.url, "_blank"); };
  ```
  (Wrap in `try/catch`; permission denied → silently skip, in-app bell still works.)
- After polling, call `router.refresh()` only if the unread count changed (avoid needless refreshes).

Keep styling consistent with the sidebar (muted foreground, `rounded-lg`, `hover:bg-accent/60`). Use
a simple absolutely-positioned dropdown panel (match `command-palette`/existing patterns) — you may
use the existing shadcn `DropdownMenu` if present in `src/components/ui/`; otherwise a plain
conditional `<div>` panel is fine.

### 3b. Mount the bell — `src/components/layout/sidebar.tsx`
Add `<NotificationBell />` in the top header row next to `<ThemeToggle />` (line ~22). The sidebar is
always mounted in the layout, so the bell polls + pushes app-wide.

> Only mount the bell when ADO is enabled? The sidebar is a client component and can't call
> `isAzureDevOpsEnabled()` (server-only). Simplest: always mount; `pollNotificationFeed` just returns
> zeros when there are no notifications. (Optional: pass an `enabled` prop down from the server layout
> like `AzureDevOpsAutoSync` does.)

---

## Phase 4 — Notifications page + dashboard widget + nav

### 4a. Nav — `src/lib/nav.ts`
Add `Bell` to the lucide import and insert an entry (e.g. after Tasks):
```ts
{ label: "Notifications", href: "/notifications", icon: Bell },
```

### 4b. Route — `src/app/notifications/page.tsx` (server component, `force-dynamic`)
```tsx
import { PageShell } from "@/components/layout/page-shell";
import { listNotifications } from "@/features/notifications/queries";
import { NotificationsList } from "@/features/notifications/components/notifications-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const notifications = await listNotifications();
  return (
    <PageShell title="Notifications" description="Azure DevOps assignments & mentions">
      <NotificationsList notifications={notifications} />
    </PageShell>
  );
}
```
(Check `PageShell`'s exact prop names in `src/components/layout/page-shell.tsx` and match them.)

### 4c. `src/features/notifications/components/notifications-list.tsx` (`"use client"`)
- Renders the list; each item shows type label (`NOTIFICATION_LABELS`), title, message snippet,
  relative time (`date-fns`), and an unread dot.
- Actions per row: open (ADO `url`, new tab) + mark read on open; dismiss (`dismissNotification`).
- Header: "Mark all read" (`markAllNotificationsRead`). Empty state: "No notifications yet."
- Follow the toast + `router.refresh()` convention (`sonner` `toast`, `useRouter`). Reset state on
  error. Match the styling of `task-list.tsx` for consistency.

### 4d. Dashboard widget — `src/app/page.tsx`
- Import `recentNotifications`; add to the `Promise.all` at the top.
- Add a `Card` (icon: `Bell` via `IconChip`, title "Notifications", `ViewAllLink href="/notifications"`)
  in one of the two-column grids. List up to 5 recent unread (title + label + relative time). Empty
  state: "You're all caught up." Keep the existing animation/`enter` classes for visual parity.

---

## Verification (run after each phase, and at the end)

```bash
npx tsc --noEmit          # types
npm run build             # full build (server/client boundary + lint)
```
- After the migration, **restart `npm run dev`** (Gotcha #2), then in Settings click **Sync now** to
  populate notifications from current ADO state.
- Manually verify: (1) a newly assigned item creates an "assigned" notification + desktop popup;
  (2) an @mention of you in a recent comment creates a "mentioned" notification; (3) the bell badge,
  `/notifications` page, and dashboard widget all reflect the data; (4) marking read/dismiss works
  and persists.

## Standing doc rule (AGENTS.md) — REQUIRED, same change

Add a `features/notifications` bullet to `AGENTS.md` describing: detection lives in
`syncAzureDevOps` (assigned = newly-imported item; mentioned = my GUID in a `data-vss-mention` anchor
of a comment created within `MENTION_LOOKBACK_DAYS`), dedup via unique `dedupeKey`, the client
`NotificationBell` polls `pollNotificationFeed` every 60s and fires the Web Notifications API
(marking `notifiedAt` so a popup fires once), soft-delete like every module, and that `sanitizeHtml`
strips `data-vss-mention` so detection uses RAW comment HTML. Keep it concise.

## Out of scope (do not build)
- Webhooks / tunnels / always-on background service.
- Catching mentions on work items you've never been involved in (best-effort only).
- In-app modal deep-link from `/notifications` (link to the ADO `url` instead).
- Notification preferences/settings UI (can be a later pass).
