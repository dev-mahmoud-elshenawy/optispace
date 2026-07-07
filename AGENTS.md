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
  `optispace:open-command` event). Navigation-only for now.

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
