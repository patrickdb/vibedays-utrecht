# Authentication

## Approach

- Better Auth, email and password only, pinned to exactly `1.7.7` for both `better-auth` and `@better-auth/drizzle-adapter` (`--save-exact`; the two must move together). Docs start at https://better-auth.com/llms.txt (append `.md` to a docs URL for plain text).
- `lib/auth.ts` is the server instance: Drizzle adapter on `lib/db.ts`, plus the `bearer` and `deviceAuthorization` plugins. `nextCookies()` must stay the last plugin. `lib/auth-client.ts` is the browser client; it already carries the device-authorization client plugin.
- `bearer` exists so the REST API and the CLI can send `Authorization: Bearer <token>`; the token is the `set-auth-token` response header of a sign-in. `deviceAuthorization` is configured with `verificationUri: "/device"` for the CLI's `gh auth login`-style flow; its page and client UI do not exist yet.
- The route handler is `app/api/auth/[...all]/route.ts`. Forms are client components calling `authClient`; shared styling lives in `components/ui/form.tsx` (no class strings in pages).

## One place reads sessions

- `lib/session.ts` exports `getUserId(headers)`: the signed-in user's id for a session cookie or a bearer token, otherwise `null`. Every adapter (pages, REST, agent tools, MCP) calls it; nothing else calls `auth.api.getSession`.
- Pages that need more than the id (the name on `/`) look the user up in the database by that id.
- `/` checks the session in the page itself, not in `proxy.ts`: the Next.js 16 proxy would only be an optimistic cookie check, and the page must be correct even when the proxy is bypassed.

## Schema and migrations

- The auth tables in `lib/schema.ts` mirror what Better Auth defines for our plugins (`getAuthTables` in `@better-auth/core`, plus the device-authorization plugin schema; bearer adds no tables). They were written by hand from those definitions because the CLI (`npx auth@latest generate --adapter drizzle --dialect sqlite`) was not available. Whenever plugins or Better Auth's version change, run the CLI to a scratch file and diff it against `lib/schema.ts`.
- Drizzle `relations` are not defined: the adapter's joins option is off, so Better Auth does not need them.
- Schema changes go through `npm run db:generate` and `npm run db:migrate` (see [database.md](database.md)).
- Domain tables go into `lib/schema.ts` next to the auth ones.

## Environment

- `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` (see `.env.example`). Better Auth rejects requests whose `Origin` differs from the base URL, so anything serving the app on another port must set `BETTER_AUTH_URL` to match; `playwright.config.ts` does this for its port.

## Testing

- `tests/unit/auth.test.ts` runs Better Auth against a migrated temp database. It builds a second, test-only instance with the `testUtils()` plugin on the same database and secret (the docs advise keeping `testUtils` out of the production config); cookies minted by it are valid for the production `auth`, which is what `getUserId` is tested against. Bearer tokens come from a real sign-in.
- The file opts into the Node environment (`// @vitest-environment node`) because the default jsdom environment is wrong for a server library.
- `tests/e2e/auth.spec.ts` drives the real sign-up, sign-out, sign-in flow.
- Async Server Components (`app/page.tsx`) cannot be rendered in Vitest; they are covered by E2E.
