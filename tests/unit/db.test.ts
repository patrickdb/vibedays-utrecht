import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-db-test-"));
let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  ({ db } = await import("@/lib/db"));
});

afterAll(() => {
  db.$client.close();
  vi.unstubAllEnvs();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps the SQLite file locked until the process exits. It is in
    // the OS temp dir, so leaving it behind is harmless.
  }
});

test("migrates a temporary database file and answers queries", async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });

  const rows = await db.all<{ one: number }>(sql`select 1 as one`);
  expect(rows).toEqual([{ one: 1 }]);

  const tables = await db.all<{ name: string }>(
    sql`select name from sqlite_master where name = '__drizzle_migrations'`,
  );
  expect(tables).toHaveLength(1);
});
