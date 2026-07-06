# OptiSpace — Module Build Conventions

Every feature module MUST follow this exact shape. Read this fully before coding.

## Stack (already installed — DO NOT install anything or run `shadcn add`)
- Next.js 16 App Router, React 19, TypeScript, Tailwind v4
- Prisma 6 + SQLite. Client: `import { db } from "@/lib/db"`
- Zod for validation. next-themes (dark default). lucide-react icons.
- date-fns for date formatting. @dnd-kit/* for drag-and-drop (Tasks only).
- shadcn/ui components live in `src/components/ui/*`. Import what exists there,
  e.g. `import { Button } from "@/components/ui/button"`. If a primitive you need
  is missing, build a tiny local one inside your feature's `components/` folder.
  NEVER run `npx shadcn add` or `npm install` (it corrupts parallel builds).

## Folder shape — `src/features/<module>/`
- `schema.ts`   — Zod schemas for create/update inputs. Infer TS input types from them.
- `service.ts`  — pure helpers + `toView(row)` mapping Prisma row -> a plain view type
                  (parse tags via `parseTags` from `@/types`, compute derived fields).
                  No Next.js imports here.
- `queries.ts`  — `import "server-only"`. Read functions using `db`. Return view types.
- `actions.ts`  — `"use server"` at top. Create/update/delete Server Actions:
                  validate input with the zod schema, write via `db`, then
                  `revalidatePath("/<route>")`. Return `{ ok: true }` or
                  `{ ok: false, error: string }`. Never throw to the client.
- `components/` — client components ("use client"). Forms, cards, lists, dialogs.

## Route page — `src/app/<route>/page.tsx`
- Server component. Fetch data via `queries.ts`, render the module's client
  component. Wrap in the shared `<PageShell title=... description=...>` from
  `@/components/layout/page-shell`.

## Shared types & helpers — `@/types`
- Enum unions: `LEAVE_TYPES/LeaveType`, `TASK_STATUSES/TaskStatus`,
  `TASK_PRIORITIES/TaskPriority`, `PROJECT_PLATFORMS/ProjectPlatform`,
  `PROJECT_STATUSES/ProjectStatus`, `PACKAGE_REGISTRIES/PackageRegistry`,
  `PACKAGE_LANGUAGES/PackageLanguage`, `PACKAGE_STATUSES/PackageStatus`.
- `parseTags(raw)` -> string[] and `serializeTags(string[])` -> string for tag fields.
- `cn(...)` from `@/lib/utils` for className merging.

## Rules
- TypeScript strict. No `any` (use `unknown` + narrow). Explicit return types on
  exported functions. String-literal unions, never `enum`.
- Immutable updates (spread, no mutation).
- Use theme tokens via Tailwind classes: `bg-card`, `bg-background`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `bg-accent`, `bg-primary`,
  `text-primary-foreground`, `bg-destructive`. NEVER hardcode hex colors.
- Dates: native `<input type="date">` for input (value as `yyyy-MM-dd`); format for
  display with date-fns `format(date, "MMM d, yyyy")`. All dates are UTC in the DB.
- Every list has a friendly empty state ("No X yet — add your first…") + an Add button.
- Full CRUD everywhere (add / edit / delete). Delete uses a confirm dialog.
- Keep components < ~150 lines; split when larger.
- No `console.log` in committed code.

## Server Action return contract (use this exact type)
```ts
export type ActionResult = { ok: true } | { ok: false; error: string };
```

## Example toView pattern
```ts
import { parseTags } from "@/types";
export type TaskView = { id: string; title: string; tags: string[]; /* ... */ };
export function toTaskView(row: TaskRow): TaskView {
  return { id: row.id, title: row.title, tags: parseTags(row.tags) /* ... */ };
}
```
