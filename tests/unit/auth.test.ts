// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-auth-test-"));
const email = "lissie@example.com";
const password = "correct horse battery";

// Test-only twin of the production instance: same database and secret, plus
// test-utils. Cookies it mints are valid for the production `auth`.
function createTestAuth(
  database: typeof import("@/lib/db").db,
  schema: typeof import("@/lib/schema"),
) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    plugins: [testUtils()],
  });
}

let db: typeof import("@/lib/db").db;
let auth: typeof import("@/lib/auth").auth;
let getUserId: typeof import("@/lib/session").getUserId;
let testAuth: ReturnType<typeof createTestAuth>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  ({ auth } = await import("@/lib/auth"));
  ({ getUserId } = await import("@/lib/session"));
  testAuth = createTestAuth(db, await import("@/lib/schema"));
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

describe("email and password", () => {
  test("sign-up creates the user", async () => {
    const { user } = await auth.api.signUpEmail({
      body: { name: "Lissie", email, password },
    });
    expect(user.email).toBe(email);
    expect(user.name).toBe("Lissie");
  });

  test("the right password signs in", async () => {
    const { user } = await auth.api.signInEmail({ body: { email, password } });
    expect(user.email).toBe(email);
  });

  test("a wrong password is rejected", async () => {
    await expect(
      auth.api.signInEmail({ body: { email, password: "not the password" } }),
    ).rejects.toThrow();
  });
});

describe("getUserId", () => {
  test("returns the user id for a session cookie", async () => {
    const { test: helpers } = await testAuth.$context;
    const user = await helpers.saveUser(helpers.createUser());
    const headers = await helpers.getAuthHeaders({ userId: user.id });

    expect(await getUserId(headers)).toBe(user.id);
  });

  test("returns the user id for a bearer token", async () => {
    const { headers: responseHeaders, response } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    const token = responseHeaders.get("set-auth-token");
    expect(token).toBeTruthy();

    const headers = new Headers({ authorization: `Bearer ${token}` });
    expect(await getUserId(headers)).toBe(response.user.id);
  });

  test("returns null without a cookie or token", async () => {
    expect(await getUserId(new Headers())).toBeNull();
  });

  test("returns null for an invalid bearer token", async () => {
    const headers = new Headers({ authorization: "Bearer not-a-real-token" });
    expect(await getUserId(headers)).toBeNull();
  });
});
