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

- The E2E dev server uses `NEXT_DIST_DIR=.next-e2e` (read in `next.config.ts`) so it does not collide with the `.next` lock of a running `npm run dev`.
- `next dev` rewrites `tsconfig.json` (adds `.next-e2e/...` type includes, reflows arrays); keep those includes committed and Biome-formatted or `npm run lint` fails after an E2E run.
- Locally Playwright reuses a server already on port 3100; in CI (`CI` set) it always starts a fresh one.
- The first run is slow on Windows (jsdom and the dev server cold start); the later runs are much faster.
