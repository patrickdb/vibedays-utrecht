<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# todo-cat

A to-do list web app kept by Lissie, a cat with attitude (an AI agent, coming later).
Next.js 16 App Router at the repo root, plus npm workspaces `contract/` (shared zod schemas) and `cli/` (the todo-cat CLI).

## Commands

Run from the repo root.

- `npm install` installs the root app and both workspaces.
- `npm run dev` starts the dev server on http://localhost:3000.
- `npm run build` builds the app for production and bundles the CLI; `npx todo-cat --help` runs the CLI (see [cli.md](tech-docs/cli.md)).
- `npm run lint` runs `biome check` (lint, format and import order); it must pass before every commit.
- `npm run format` rewrites files with the Biome formatter.
- `npm run db:generate`, `db:migrate` and `db:reset` manage the SQLite database; see [database.md](tech-docs/database.md).
- `npm run db:seed` fills the dev database with a demo user and todos (`demo@todo-cat.dev` / `cat-person-2026`); safe to repeat.
- `npm run qa` runs lint, typecheck, build, unit and e2e tests; see [testing.md](tech-docs/testing.md).

**Run `npm run qa` before you call a task done. Fix the code instead of suppressing findings** (no `biome-ignore`, `@ts-ignore`, skipped tests or loosened config).

## Researching docs

Libraries here are newer than your training data; look things up before writing code, never recall.

- Next.js: `node_modules/next/dist/docs/`.
- Drizzle and other vendors that publish an `llms.txt` (e.g. https://orm.drizzle.team/llms.txt): start there and follow the links to the relevant pages.
- Mastra, CopilotKit and design work: the installed skills in `.claude/skills/` (`mastra`, `copilotkit`, `impeccable`, `frontend-design`).
- Any other library, and the fallback when the above has no answer: the `ctx7` CLI from the `find-docs` skill (`npx ctx7@latest library <name> "<question>"`, then `docs <id> "<question>"`).
- Prefer the installed package (`node_modules/<pkg>`, its types) over docs when they disagree: the code is what runs.

## Tech docs

`tech-docs/` holds project-specific technical docs; agents are the primary audience.

- Describe approach, principles, design decisions with their reasons, and gotchas.
- Point to the central files instead of copying code.
- Leave out anything an agent finds out by reading the code.
- Current state only: delete outdated content instead of adding caveats.

Index:

- [architecture.md](tech-docs/architecture.md) — the todo service, the contract and the thin adapters around them.
- [workspaces.md](tech-docs/workspaces.md) — the npm workspace layout and why it exists before its content does.
- [testing.md](tech-docs/testing.md) — Vitest and Playwright strategy, commands and gotchas.
- [database.md](tech-docs/database.md) — Drizzle on SQLite via libsql: the single db module, migrations, test databases.
- [auth.md](tech-docs/auth.md) — Better Auth: plugins, the single session helper, generated schema, tests.
- [rest-api.md](tech-docs/rest-api.md) — the `/api/todos` endpoints and how to get a bearer token.
- [cli.md](tech-docs/cli.md) — the `todo-cat` CLI: commands, agent-friendly output, device login, tests.

## Keeping this map current

- When a change invalidates a line here or in `tech-docs/`, or teaches a costly lesson, update them in the same change.
- Prefer deleting over adding, pointers over prose, one sentence per bullet.
