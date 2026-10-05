# CLI

`cli/` (package `todo-cat-cli`, binary `todo-cat`) is a client of the REST API ([rest-api.md](rest-api.md)), never of the database. Its main users are AI agents working for a human; every design choice below serves a caller that cannot answer prompts and parses what it reads. Built on commander.js 15 (ESM only).

## Layout

- `src/program.ts` defines the commands (one per REST use case: `list`, `add`, `get`, `edit`, `done`, `reopen`, `delete`, plus `login`, `logout`, `whoami`); `src/index.ts` runs it and turns errors into exit codes.
- `src/client.ts` is the only REST caller. Requests are validated with the contract schemas before they are sent and every response is parsed with them; nothing is re-declared. `src/auth.ts` talks to Better Auth through its own client (`better-auth/client`, device-authorization plugin) so auth shapes are not hand-written either. `src/config.ts` holds the server URL and the token file.
- `bin/todo-cat.mjs` is the committed launcher npm links as `todo-cat`; it loads `dist/cli.mjs`, the esbuild bundle (`cli/build.mjs`, gitignored). The root `prepare` script builds it on `npm install`, so `npx todo-cat` works from the repo root afterwards; the root `build` script rebuilds it. The bundle includes the contract (it ships TypeScript source) and every dependency.

## Interface for agents

- `--json` on every command prints one JSON document to stdout. Without it, readable text. stdout carries results only; instructions (the login code) and diagnostics go to stderr.
- Errors go to stderr as `error <code>: <message>`, or `{"error":{"code","message"}}` with `--json`. Codes are the contract's `ErrorCode`s plus a few client-side ones (`src/errors.ts`); that file also maps each code to an exit code in a `Record`, so a new contract code fails typecheck until it gets one. The exit-code table is printed by `--help` (`EXIT_CODE_HELP`); keep both in sync.
- The CLI never prompts. `delete` refuses without `--yes`.
- `login --json` prints one JSON object per line: the device code first, then the result. An agent reads the first line, shows the code and URL to the human, and waits for the process to exit.

## Login, token, server

- `login` runs the RFC 8628 device flow against Better Auth (`/api/auth/device/code`, then polls `/api/auth/device/token` at the server's interval, honoring `slow_down`). It prints the code and URL and never opens a browser. The approval page is `app/device/page.tsx` plus `components/device-approval.tsx`: a signed-in user enters or confirms the code, then approves or denies. Looking a code up binds it to that user, which Better Auth requires before approval. Signed-out visitors go through `/login?next=` and come back (`lib/safe-redirect.ts` only allows same-site paths).
- The token (the Better Auth session token, accepted as a bearer token) lives in `credentials.json` in the config directory: `$TODO_CAT_CONFIG_DIR`, else `%APPDATA%\todo-cat` on Windows, else `$XDG_CONFIG_HOME/todo-cat` or `~/.config/todo-cat`. It is written to a temp file with mode 0600 and renamed into place; Windows ignores the mode, the user profile ACL protects it there. The token is never printed.
- The file also records the server it was issued for; the CLI refuses to send it to a different `TODO_CAT_URL`.
- `logout` revokes the session on the server (`signOut`), then deletes the file. If the server cannot be reached the file is still deleted and the exit code is non-zero, so the caller knows the session may live on.
- `TODO_CAT_URL` is the server (default `http://localhost:3000`).

## Tests

- `cli/tests/cli.test.ts` (Vitest, picked up by the root config) builds the CLI, migrates a temp database, starts `next dev` on a free port (dist dir `.next-cli-test`) and drives the built binary through the full flow: login, whoami, add, list, done, delete, logout, whoami failing. The device code is approved through a test-only Better Auth instance with the `testUtils()` plugin on the same database and secret, the same trick as `tests/unit/auth.test.ts`. Login polls at the server's 5 second interval, so the test takes about 20 seconds after the server is up.
- `tests/e2e/device.spec.ts` covers the browser side: sign up through the `next` redirect, approve.
- `npm run typecheck` includes `cli/` (it has its own `tsconfig.json`, and the root one excludes it); `npm run qa` builds it as part of `build`.

## Gotchas

- The `.next-cli-test` includes in the root `tsconfig.json` are committed, like the `.next-e2e` ones, so `next dev` does not rewrite the file (see [testing.md](testing.md)).
- A workspace bin is only linked at install time; after adding or renaming one, run `npm rebuild todo-cat-cli`.
