import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// All three are overridable so parallel runs (other checkouts, `npm run dev`)
// never share a port, a Next.js dist dir or a database file.
const port = Number(process.env.E2E_PORT ?? 3100);
const distDir = process.env.E2E_DIST_DIR ?? ".next-e2e";
const databaseFile =
  process.env.E2E_DATABASE_FILE ??
  join(mkdtempSync(join(tmpdir(), "todo-cat-e2e-")), "e2e.db");

export default defineConfig({
  testDir: "tests/e2e",
  // The dev server compiles a route on its first request, and `/` pulls in
  // Mastra and CopilotKit, so the first navigation is slow.
  timeout: 120_000,
  expect: { timeout: 60_000 },
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}`, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run db:migrate && npx next dev --port ${port}`,
    url: `http://localhost:${port}`,
    env: {
      NEXT_DIST_DIR: distDir,
      DATABASE_URL: `file:${databaseFile}`,
      // Better Auth rejects requests whose Origin differs from its base URL.
      BETTER_AUTH_URL: `http://localhost:${port}`,
    },
    // Never attach to a foreign server: a taken port should fail loudly.
    reuseExistingServer: false,
    // The first request compiles the app, Mastra and CopilotKit included.
    timeout: 180_000,
  },
});
