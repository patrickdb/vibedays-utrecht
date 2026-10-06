import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// The chat e2e calls the model through OpenRouter, so it needs a real
// OPENROUTER_API_KEY and stays out of `npm run qa` and CI: `npm run test:e2e:chat`.
export default defineConfig({
  ...baseConfig,
  testDir: "tests/e2e-chat",
  timeout: 120_000,
});
