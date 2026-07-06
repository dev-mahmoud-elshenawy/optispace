# OptiSpace

A local-first personal workspace for a mobile team lead & open-source developer.
Single user, runs entirely on your machine, no auth, no external services — except
one explicit, manual "Refresh stats" action in the Packages module.

## Modules

- **Dashboard** — remaining leave, open tasks, active projects, package count, profile links
- **Annual Leave** — yearly allowance, leave log, used/remaining, month view, history
- **Profiles Hub** — linked profiles (GitHub, LinkedIn, Medium, pub.dev, npm, site, X)
- **Tasks** — Kanban board (drag & drop) + filterable list, full CRUD
- **Development Progress** — in-flight projects, milestone checklists, progress bars
- **Packages** — published npm / pub.dev packages, manual live-stats refresh

## Stack

Next.js 16 (App Router) · TypeScript · Prisma 6 + SQLite · Tailwind v4 · shadcn/ui ·
Zod · Server Actions · next-themes (dark by default) · @dnd-kit · date-fns.

Feature-based architecture: each module lives in `src/features/<module>/` with a
consistent `schema.ts` (Zod) / `service.ts` (logic) / `queries.ts` (reads) /
`actions.ts` (Server Actions) / `components/` split. Adding a new module = a new
folder + one entry in `src/lib/nav.ts`.

## Setup (macOS + Oh My Zsh)

Requires Node 20+ (tested on Node 22) and npm.

```zsh
# 1. Clone
git clone git@github.com:dev-mahmoud-elshenawy/optispace.git
cd optispace

# 2. Install dependencies
npm install

# 3. Create the local SQLite DB + run migrations
#    (.env already points DATABASE_URL at prisma/dev.db)
npx prisma migrate dev

# 4. Seed sample data (packages, profiles, tasks, projects, leave)
npm run seed

# 5. Start the dev server
npm run dev
```

Open http://localhost:3000.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run seed` | Reset & seed sample data (`prisma db seed`) |
| `npx prisma studio` | Browse the SQLite DB in a GUI |
| `npx prisma migrate dev` | Apply schema changes as a new migration |

## Packages — "Refresh stats" (the only network feature)

The Packages module can pull live data from public, no-auth registry APIs on demand
(never on page load — the app works fully offline from cached values):

- **npm** — latest version from `registry.npmjs.org/<pkg>`; weekly downloads from
  `api.npmjs.org/downloads/point/last-week/<pkg>`.
- **pub.dev** — latest version from `pub.dev/api/packages/<pkg>`; likes & pub points
  from `pub.dev/api/packages/<pkg>/score`.

Fetched values are cached with a `lastSyncedAt` timestamp.

> The seeded package **slugs are best-guess**. If a "Refresh" fails, open the package,
> fix its `name` to the exact registry slug, and refresh again.

## Notes

- All timestamps are stored UTC (SQLite). Dates display in your local time.
- SQLite has no native enums/arrays, so enum-like fields are validated strings
  (`src/types`) and tags are stored as JSON strings.
- `prisma/dev.db` is git-ignored — your data stays local.
