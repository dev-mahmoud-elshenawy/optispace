<div align="center">

# 🗂️ OptiSpace

**A local-first workspace for a mobile team lead & open-source developer.**

OptiSpace unifies your tasks, projects, packages, leave, and reference files — and pulls in your
**Azure DevOps work items**, **@mention notifications**, and **Outlook/Teams calendar** — in one
fast, private app that runs entirely on your machine. One workspace. Everything in its place.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Prisma](https://img.shields.io/badge/Prisma-SQLite-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/) [![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/) ![Local-first](https://img.shields.io/badge/Local--first-single%20user-1A6BD4) [![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

<a href="https://www.buymeacoffee.com/m.elshenawy">
  <img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support%20My%20Work-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=0D1117" alt="Buy Me A Coffee"/>
</a>

</div>

---

## 💡 Who it's for

You're a developer or team lead whose day is scattered across Azure DevOps, Outlook, a task
board, and a dozen browser tabs — and things slip: an `@mention` buried in email, a task tracked
in three places, a project's `.env` and server logins living in random notes.

**OptiSpace pulls it into one private app on your machine:**

- Your ADO work items become tasks, and assignments/@mentions hit you with **desktop alerts** — the Outlook threads you overlook stop slipping through.
- Every project carries its own files, credentialed links, and client feedback in **one hub** — no more hunting.
- Today's meetings, due tasks, and unread mentions land on **one dashboard**.

No cloud, no accounts, nothing leaving your laptop. Fast, focused, and entirely yours.

---

## 🔥 Why OptiSpace?

- **Local-First & Private** — runs entirely on your machine; no auth, no cloud, no tracking

- **Azure DevOps, two-way** — work items assigned to you sync into Tasks; edit state, comments, and real `@`-mentions straight back to ADO

- **Notifications you won't miss** — assignments & @mentions surfaced in-app with browser **desktop push** (the Outlook emails you overlook)

- **Calendar built in** — your Outlook/Teams meetings (published ICS) in a month/day view; today's agenda on the dashboard

- **Notion-Style Tasks** — Kanban / list / by-project views, drag & drop, subtasks, recurring tasks, sprint grouping

- **Per-Project Hub** — files (`.env`, keystores), release/dashboard/server links with credentials, and client feedback — all per project

- **Nothing Is Ever Lost** — soft delete everywhere; restore anything from the Archive · full workspace **backup/restore** to one JSON

- **Fast to navigate** — `⌘K` command palette jumps to any page or record; dark, branded UI

---

## ✨ Modules

| Module | What it does |
|--------|--------------|
| 🏠 **Dashboard** | Stats, upcoming leave, recent tasks, active projects — every card links through |
| 🌴 **Annual Leave** | Allowance, monthly accrual, calendar with month picker + drag-to-select, history |
| 🔗 **Profiles** | Quick links to your GitHub, npm, pub.dev, LinkedIn, site, and more |
| ✅ **Tasks** | Kanban / list / by-project views — drag & drop, priority flags, inline quick-add, title search + project filter, subtask checklists, recurring tasks, overdue flags |
| 🛠️ **Development** | Projects with milestone checklists, nested tasks, and a per-project hub: files, links (releases/dashboards/servers, with credentials), and client feedback (tied to a release, with optional attached document) |
| 📦 **Packages** | Published npm / pub.dev packages with on-demand live stats, source/language/tag filters + update-available badge |
| 🔄 **Azure DevOps sync** | Imports work items assigned to you into Tasks (configure `AZURE_DEVOPS_*` in `.env`); manual Sync now + auto-sync while the app is open |
| 🔀 **Pull Requests** | PRs you authored, were asked to review, or are assigned to (connect GitHub in **Settings** via OAuth device flow — no token/`.env`), grouped by repo in collapsible sections with review-decision + CI-checks badges; review-requested and status-change notifications |
| 🔔 **Notifications** | Bell in the sidebar + a full list + dashboard widget for Azure DevOps assignments/@mentions, task due-dates, and GitHub PR review requests/status changes, with desktop push while the app is open |
| 📅 **Calendar** | Agenda of your Outlook/Teams meetings from a published ICS feed (`CALENDAR_ICS_URL` in `.env`); today's meetings also surface on the dashboard |
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

### 🔌 Optional integrations

Copy `.env.example` → `.env` and fill in only what you want. Restart `npm run dev` after editing.

| Integration | Env vars | What you get |
|-------------|----------|--------------|
| **Azure DevOps** | `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PAT` *(Work Items: Read)* | Your assigned work items in Tasks + assignment/@mention notifications. Use a **Read & Write** PAT to edit state/comments back. |
| **GitHub PRs** | _none_ — connect in **Settings** (OAuth device flow) | PRs you authored, were asked to review, or are assigned to — across any repo the connected account can see — grouped by repo in collapsible sections, with review/CI badges + notifications. One-time: enter your OAuth App **Client ID** (device flow enabled) once in Settings — saved on the device, no token or `.env`; after that it's a one-click Connect. |
| **Calendar** | `CALENDAR_ICS_URL` | Outlook/Teams agenda (Settings → Calendar → **Publish a calendar** → copy the ICS link). |

Both are optional — leave the vars blank to hide the feature. No keys committed; `.env` is git-ignored.

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
