# Testing

## Strategy

- Two layers: Vitest for unit and integration tests, Playwright for end-to-end tests. Prefer the lowest layer that can prove the behavior.
- Unit tests live in `tests/unit/` (`*.test.ts(x)`, jsdom, config in `vitest.config.mts`); the `@/` alias works via tsconfig paths.
- E2E tests live in `tests/e2e/` (`*.spec.ts`, Chromium only, config in `playwright.config.ts`).
- Vitest cannot render `async` Server Components (Next.js docs); cover those with E2E.

## Commands

- `npm test` runs Vitest once (no watch). Use `npx vitest` for watch mode.
- `npm run test:e2e` runs Playwright; it starts its own dev server on port 3100, so `npm run dev` on 3000 can keep running.
- After a fresh install run `npx playwright install chromium` once to download the browser.

## Gotchas

- The E2E dev server uses its own dist dir (`.next-e2e`, via `NEXT_DIST_DIR` read in `next.config.ts`) so it does not collide with the `.next` lock of a running `npm run dev`.
- `next dev` rewrites `tsconfig.json` (adds `.next-e2e/...` type includes, reflows arrays); keep those includes committed and Biome-formatted or `npm run lint` fails after an E2E run.
- Playwright never reuses an already running server; a taken port fails loudly. Override `E2E_PORT` (default 3100), `E2E_DIST_DIR` (default `.next-e2e`) and `E2E_DATABASE_FILE` (default: fresh temp file) to run several checkouts at once. The server gets `DATABASE_URL=file:<that file>`.
- A non-default `E2E_DIST_DIR` makes `next dev` add that dir to `tsconfig.json`; do not commit that change.
- `npm run qa` runs `next build`, which uses `.next`: stop `npm run dev` first or expect a lock clash.
- The first run is slow on Windows (jsdom and the dev server cold start); the later runs are much faster.

## QA script

- `npm run qa` (`scripts/qa.sh`) is the single gate: lint, typecheck (root plus every workspace with a `typecheck` script), build, unit, e2e. Sections run in that order and all run even after a failure.
- Output is plain text. A passing section prints one PASS line; a failing section prints its full output. Every section also logs to `.qa/<section>.log` (gitignored). Exit code is non-zero if any section failed.
- Biome only enforces its recommended rules; an unused variable is not an error, `debugger` is.

## CI

- `.github/workflows/qa.yml` runs `npm run qa` on every push and pull request (Node 24, `npm ci`). It never deploys.
- Playwright browsers are cached by Playwright version; system deps are installed on every run.
- The workflow generates `.env` with dummy secrets; never put real ones in CI.
- Watch a run with `gh run watch`.
