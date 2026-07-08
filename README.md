<div align="center">

# 🗂️ OptiSpace

**A local-first workspace for a mobile team lead & open-source developer.**

OptiSpace keeps your leave, tasks, projects, packages, and reference files in one fast,
private app that runs entirely on your machine. One workspace. Everything in its place.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Prisma](https://img.shields.io/badge/Prisma-SQLite-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/) [![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/) ![Local-first](https://img.shields.io/badge/Local--first-single%20user-1A6BD4) [![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

<a href="https://www.buymeacoffee.com/m.elshenawy">
  <img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support%20My%20Work-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=0D1117" alt="Buy Me A Coffee"/>
</a>

</div>

---

## 🔥 Why OptiSpace?

- **Local-First & Private** — runs entirely on your machine; no auth, no cloud, no tracking

- **One Workspace** — leave, tasks, projects, packages, profiles, and files in a single app

- **Nothing Is Ever Lost** — soft delete everywhere; restore anything from the Archive

- **Notion-Style Tasks** — Kanban board, list, and by-project views with drag & drop

- **Per-Project Hub** — keep everything for a project in one place: files (`.env`, keystores), release/dashboard/server links with credentials, and client feedback

- **Full Backup & Restore** — export your entire workspace (records + files) to one JSON

- **Dark, Branded UI** — `#0D1117 → #00D9FF`, tuned typography, tasteful animations

---

## ✨ Modules

| Module | What it does |
|--------|--------------|
| 🏠 **Dashboard** | Stats, upcoming leave, recent tasks, active projects — every card links through |
| 🌴 **Annual Leave** | Allowance, monthly accrual, calendar with month picker + drag-to-select, history |
| 🔗 **Profiles** | Quick links to your GitHub, npm, pub.dev, LinkedIn, site, and more |
| ✅ **Tasks** | Kanban / list / by-project views — drag & drop, priority flags, inline quick-add, title search + tag filter, subtask checklists, recurring tasks, overdue flags |
| 🛠️ **Development** | Projects with milestone checklists, nested tasks, and a per-project hub: files, links (releases/dashboards/servers, with credentials), and client feedback (tied to a release, with optional attached document) |
| 🎯 **Milestones** | Cross-project roadmap — every project's milestone checklist and progress in one place |
| 📦 **Packages** | Published npm / pub.dev packages with on-demand live stats, source/language/tag filters + update-available badge |
| ♻️ **Archive** | Everything deleted lands here — restore it or permanently purge |
| ⚙️ **Settings** | One-click backup export / import of your whole workspace |

---

## 🚀 Setup

> Requires **Node 20+** and npm.

```bash
git clone git@github.com:dev-mahmoud-elshenawy/optispace.git
cd optispace
npm install
npx prisma migrate dev   # create local SQLite DB + run migrations
npm run seed             # optional: sample data
npm run dev              # → http://localhost:3000
```

---

## 🧭 Commands

| Command | Does |
|---------|------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run seed` | Reset & seed sample data |
| `npx prisma migrate dev` | Apply schema changes as a migration |
| `npx prisma studio` | Browse the SQLite DB in a GUI |

---

## 🏗️ Architecture

Feature-based — each module lives in `src/features/<module>/`:

```
schema.ts     Zod validation
service.ts    pure logic + view mappers
queries.ts    reads   (server-only)
actions.ts    writes  (Server Actions)
components/   UI
```

**Add a module** = a new folder + one entry in `src/lib/nav.ts`.

---

## 🔒 Data & Privacy

- Everything lives in `prisma/dev.db` (git-ignored) — **your only copy, so export backups**.
- Stored **unencrypted** by design (local, single-user). Never commit or share `dev.db`.
- All timestamps are UTC; dates render in your local time.
- SQLite has no enums/arrays → enum-like fields are validated strings, tags are JSON strings.

---

## 👤 Created By

<div align="center">

### Built with ❤️ by [Mahmoud El Shenawy](https://github.com/dev-mahmoud-elshenawy)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?logo=linkedin&logoColor=white&style=for-the-badge)](https://www.linkedin.com/in/dev-mahmoud-elshenawy) [![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white&style=for-the-badge)](https://github.com/dev-mahmoud-elshenawy) [![Medium](https://img.shields.io/badge/Medium-000000?logo=medium&logoColor=white&style=for-the-badge)](https://medium.com/@dev-mahmoud-elshenawy) [![Facebook](https://img.shields.io/badge/Facebook-1877F2?logo=facebook&logoColor=white&style=for-the-badge)](https://www.facebook.com/dev.m.elshenawy)

</div>

---

## 📜 License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**OptiSpace** is released under the **[MIT License](LICENSE)** — free to use, modify, and distribute.
