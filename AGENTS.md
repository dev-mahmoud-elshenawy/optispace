<!-- BEGIN:nextjs-agent-rules -->
# ⚠️ This is NOT the Next.js you know

This is **Next.js 16** — APIs, conventions, and file structure may differ from your training data.
Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OptiSpace — agent guide

Local-first, single-user workspace. No auth, no tenants, no cloud. Everything lives in one
local SQLite file. Optimize for a solo developer's convenience, not multi-user hardening.

## 📌 Standing rule — keep these docs current (non-negotiable)

**After finishing ANY enhancement or feature, update the AI docs in the same change:**

- **`AGENTS.md`** (this file) — new module, convention, or gotcha → add it to the right section.
- **`README.md`** — user-facing changes (new module/highlight) → update the tables.

Keep both concise (no bloat). Stale docs mislead every future agent — treat the doc update as
part of "done", not optional cleanup.

## Stack

`Next.js 16` (App Router, Server Actions) · TypeScript · Prisma 6 + SQLite · Tailwind v4 ·
shadcn/ui · Zod · `@dnd-kit` · `date-fns`. Custom theme provider (`src/components/theme-provider.tsx`) — **no next-themes**.

## Architecture — feature modules

Each module is `src/features/<module>/` with a consistent split:

| File | Role |
|------|------|
| `schema.ts` | Zod input validation |
| `service.ts` | Pure logic + `View` mappers + shared UI-safe types/labels |
| `queries.ts` | Reads — **`import "server-only"`** |
| `actions.ts` | Writes — **`"use server"`** Server Actions |
| `components/` | UI (client where interactive) |

Routes are thin `src/app/<route>/page.tsx` that call queries and render feature components.
Nav is data-driven: add a module → new folder + one entry in `src/lib/nav.ts`.

## Conventions (follow these)

- **Data export:** `/api/export?module=<m>&format=csv|json` (route in `app/api/export`) dumps one
  module (tasks/packages/profiles/leaves/projects); the Settings `ExportPanel` links to it. Full-DB
  backup/restore still lives in `features/backup`.
- **Azure DevOps sync** (`features/integrations/azure-devops`): imports work items assigned to you
  into Tasks. Config is **per-user via `.env`** (`AZURE_DEVOPS_*`), never the DB — `service.ts`
  (`server-only`) reads env + fetches (WIQL `@me`, maps by **state category** so custom states work,
  caps 200/sync, skips done unless `INCLUDE_DONE`). `syncAzureDevOps` upserts `Task` by
  `(source="azure_devops", externalId)` — sync owns title/description/status/externalUrl/effort/changedDate, never
  deletes local tasks. Manual **Sync now** in Settings + a mount/interval **auto-poller** in the
  layout (local-first "background" = while the app is open). `Task.source/externalId/externalUrl`
  link synced rows; synced tasks link to a Development project via `projectId` (not tags — tags are
  cleared on sync). **Clicking a synced task's title** opens `AzureDevOpsTaskDetail` — an editable
  modal that **on-demand** loads description + comments + attachments + rev + allowed states
  (`fetchWorkItemDetail`). **Write-back** (needs a Work Items *Read & Write* PAT): edit title + pick
  state (from the item type's real ADO states) → `updateWorkItem` (JSON-Patch with a `/rev` test for
  concurrency → 412 on conflict); add comments → `postComment`; writes mirror onto the local task.
  Images stream through `/api/devops/attachment` (PAT server-side, GUID-only → no SSRF, safe
  Content-Type allowlist + CSP sandbox). ADO HTML sanitized with DOMPurify (strict allowlist).
  **@-mentions:** the description + comment fields use `MentionInput` (a contentEditable, not a
  textarea) — typing `@` queries `searchAzureDevOpsIdentities` (ADO Identity Picker API) and inserts
  a real `<a data-vss-mention="version:2.0,{guid}">` anchor so ADO notifies the person. Comment/
  description post as **HTML** (mentions round-trip). Shared `AdoIdentity` type lives in
  `azure-devops/types.ts` (no `server-only`, so the client can import it). Note: `sanitizeHtml`
  strips `data-vss-mention` on *display*, so pre-existing mentions render as plain links (cosmetic;
  posting is unaffected).
- **Kanban drag/drop** (`tasks/components/task-board.tsx` → `moveTask`): the drop handler
  renumbers the **whole destination column** contiguously (`moveTask(id, status, orderedIds)`
  sets order = array index in one `$transaction`) — never persist a lone card's order or
  siblings collide and cards jump slots. Dropping a card on itself is a no-op. A **cross-column
  drag of an Azure DevOps task** does NOT flip local status (sync owns it); it calls `onStatusPick`,
  opening `AzureDevOpsTaskDetail` in `statusOnly` mode — a slim dialog showing only that work item's
  real ADO state picker + Save (write-back), no title/description/comments. Same-column reorder of a
  synced task still persists order. (Clicking a card title still opens the full editor via `onEdit`.)
- **Tasks sort/filter** (`tasks-view.tsx`): top-bar controls apply across Board/Project/Sprint —
  **status** filter (the stored `status` is already the 3-bucket todo/in_progress/done, so ADO's
  varied states collapse for free), **sort** (`Manual (drag order)` = Kanban `order`; `Recently
  changed` = `changedDate ?? updatedAt` desc; `Recently added` = `createdAt` desc), and a **No
  effort** toggle (DevOps tasks only, `effort == null || 0` — effort is an ADO concept, so local
  tasks are excluded from this filter). A non-manual sort passes `sorted` to `TaskBoard` so it
  keeps the given order instead of re-sorting by `order`. The List tab keeps its own column sort
  (now incl. Effort + Changed columns). DevOps `effort`/`changedDate` come from sync.
- **Recurring tasks:** `Task.recurrence` (`none|daily|weekly|monthly`). When a task transitions
  to done (via `moveTask` drag or `updateTask`), a recurring task spawns its next occurrence as a
  fresh To Do with the due date advanced (`spawnNextOccurrence` in `tasks/actions.ts`).
- **Subtasks** live in the `Subtask` model (FK → `Task`, `onDelete: Cascade`, mirrors `Milestone`).
  Included in `TaskView.subtasks` via `listTasks`; edited through `SubtaskChecklist` in the task
  dialog (optimistic local state). `addSubtask` returns the created row so the client can append it.
- **Soft delete everywhere.** Deletes set `deletedAt`; every read filters `deletedAt: null`.
  Deleted rows surface in `/archive` for restore/purge. Never hard-delete in feature actions.
- **Server-only vs client:** never import a `server-only` file (queries) into a client component.
  Shared types/labels go in `service.ts` or a dedicated `types.ts` (no `server-only`).
- **Enums are validated strings** (`src/types/index.ts`) — SQLite has no enums. Tags are JSON strings.
- **UTC everywhere** in storage/logic; format to local only in the UI.
- **Server Actions return** `{ ok: true } | { ok: false, error }`; components toast + `router.refresh()`.
- **Money/time math lives in `service.ts`** (e.g. leave accrual, `taskDaySpan`) — keep it pure.
- **Projects are a hub:** each project groups sub-resources — milestones, tasks, files, links
  (releases/dashboards/servers, with plain credentials), and client feedback — all under
  `features/projects`, all soft-deletable and restorable from `/archive`.
- **Search vs. filter:** in list views, the text search matches the **title/name only**; tags
  are a **separate filter** (a `Select` of the union of tags), never folded into text search.
  Applied in Tasks + Packages. When filtering a DnD list (kanban), merge board updates back by
  id (`handleTasksChange`) so filtered-out rows aren't dropped from state.
- **⌘K command palette** (`components/layout/command-palette.tsx`, mounted in the root layout)
  jumps between pages; opens on ⌘K/Ctrl+K or the sidebar "Search…" button (custom
  `optispace:open-command` event). Searches pages plus a server-built index
  (`features/search/queries.ts` → passed from the root layout) of task/project/package/profile
  titles; selecting routes to the owning page.

## Data & safety

- `prisma/dev.db` is git-ignored and **unencrypted by design** — it's the only copy.
  Never commit it; the `/settings` Backup export is the user's safety net.
- Schema change → `npx prisma migrate dev --name <change>`, then **restart `npm run dev`**
  (the running server caches the old Prisma client).

## Commands

`npm run dev` · `npm run build` · `npm run seed` · `npx prisma migrate dev` · `npx prisma studio`

## Gotchas

- After a migration, a stale dev server throws `Unknown argument` — restart it.
- Prisma `Bytes` reads back as `Uint8Array<ArrayBufferLike>`; wrap in `new Uint8Array(...)` for `Response` bodies.
- `@dnd-kit` needs a stable `DndContext id` or SSR hydration mismatches.
- Don't reintroduce `next-themes` — the theme is a custom context + an inline head script.
