import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env itself; real environment variables win.
try {
  process.loadEnvFile(".env");
} catch {}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

export default defineConfig({
  dialect: "turso",
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
