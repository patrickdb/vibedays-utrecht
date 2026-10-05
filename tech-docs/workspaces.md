# Workspaces

The root npm workspace lists `contract/` and `cli/` (see `package.json`); the Next.js app lives at the root.

## Why

- The web app and the CLI must agree on the shape of todos and API payloads, so both depend on `contract/` (`@todo-cat/contract`) instead of duplicating types.
- `contract/` holds zod schemas as the single source of truth; types are inferred from them.
- `cli/` (`todo-cat-cli`) is a separate package so it can ship and run without Next.js.

## Gotchas

- Both workspaces are empty placeholders (only a `package.json`); nothing imports them yet.
- Install once at the root; a single `package-lock.json` covers all workspaces.
