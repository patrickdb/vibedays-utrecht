// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-seed-test-"));
const now = new Date("2026-10-05T09:15:00.000Z");

let db: typeof import("@/lib/db").db;
let auth: typeof import("@/lib/auth").auth;
let seed: typeof import("@/lib/dev-seed");
let service: typeof import("@/lib/todo-service");
let schema: typeof import("@/lib/schema");

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  ({ auth } = await import("@/lib/auth"));
  seed = await import("@/lib/dev-seed");
  service = await import("@/lib/todo-service");
  schema = await import("@/lib/schema");
});

afterAll(() => {
  db.$client.close();
  vi.unstubAllEnvs();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps the SQLite file locked until the process exits; the file is
    // in the OS temp dir, so leaving it behind is harmless.
  }
});

// Todo ids are random; everything else must come out identical.
async function snapshot(userId: string) {
  return (await service.listTodos(userId)).map(({ id: _id, ...rest }) => rest);
}

test("creates the demo user, who can sign in, with a dozen todos", async () => {
  const { userId } = await seed.seedDemo(now);

  const signIn = await auth.api.signInEmail({
    body: { email: seed.DEMO_EMAIL, password: seed.DEMO_PASSWORD },
  });
  expect(signIn.user.id).toBe(userId);

  const todos = await service.listTodos(userId);
  expect(todos).toHaveLength(12);
  expect(todos.some((todo) => todo.done)).toBe(true);
  expect(todos.some((todo) => !todo.done)).toBe(true);
  expect(todos.some((todo) => todo.dueDate !== null)).toBe(true);

  const twoWeeksAgo = now.getTime() - 15 * 24 * 60 * 60 * 1000;
  for (const todo of todos) {
    expect(Date.parse(todo.createdAt)).toBeGreaterThan(twoWeeksAgo);
    expect(Date.parse(todo.createdAt)).toBeLessThanOrEqual(now.getTime());
    expect(todo.done).toBe(todo.completedAt !== null);
  }
});

test("running it twice gives the same state", async () => {
  const { userId } = await seed.seedDemo(now);
  const first = await snapshot(userId);

  const second = await seed.seedDemo(now);
  expect(second.userId).toBe(userId);
  expect(await snapshot(userId)).toEqual(first);

  const users = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, seed.DEMO_EMAIL));
  expect(users).toHaveLength(1);
  expect(await db.select().from(schema.todos)).toHaveLength(12);
});
