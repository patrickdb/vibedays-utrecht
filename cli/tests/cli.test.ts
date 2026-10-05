// @vitest-environment node
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { type Todo, todoSchema } from "@todo-cat/contract";
import { betterAuth } from "better-auth";
import { deviceAuthorization, testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import * as schema from "../../lib/schema.ts";

// End to end: the built CLI against a real todo-cat server (next dev on a spare
// port, temp database) with a redirected config directory. Nothing touches the
// developer's data/app.db or real login.

const root = resolve(import.meta.dirname, "../..");
const cliBin = join(root, "cli/bin/todo-cat.mjs");
const workDir = mkdtempSync(join(tmpdir(), "todo-cat-cli-test-"));
const configDir = join(workDir, "config");
const databaseUrl = `file:${join(workDir, "test.db")}`;
const secret = "cli-test-secret-cli-test-secret-123456";

let baseUrl: string;
let server: ChildProcess;
let serverLog = "";
let testAuth: ReturnType<typeof createTestAuth>;

// Test-only twin of lib/auth.ts: same database, secret and device plugin, plus
// test-utils, so the test can approve a device code without a browser.
function createTestAuth(url: string) {
  const db = drizzle({ connection: { url: databaseUrl } });
  return betterAuth({
    baseURL: url,
    secret,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    plugins: [deviceAuthorization({ verificationUri: "/device" }), testUtils()],
  });
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolvePort(port));
    });
  });
}

function stopServer() {
  if (!server?.pid) return;
  if (process.platform === "win32") {
    // `next dev` forks its real server; kill the whole tree.
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {}
  } else {
    server.kill();
  }
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next dev exited early:\n${serverLog}`);
    }
    try {
      if ((await fetch(`${url}/api/todos`)).status === 401) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next dev did not become ready:\n${serverLog}`);
}

beforeAll(async () => {
  execFileSync(process.execPath, ["build.mjs"], {
    cwd: join(root, "cli"),
    stdio: "inherit",
  });

  const port = await freePort();
  baseUrl = `http://localhost:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: baseUrl,
    NEXT_DIST_DIR: ".next-cli-test",
  };
  execFileSync(
    process.execPath,
    [join(root, "node_modules/drizzle-kit/bin.cjs"), "migrate"],
    { cwd: root, env, stdio: "ignore" },
  );

  server = spawn(
    process.execPath,
    [join(root, "node_modules/next/dist/bin/next"), "dev", "--port", `${port}`],
    { cwd: root, env },
  );
  server.stdout?.on("data", (chunk) => {
    serverLog += chunk;
  });
  server.stderr?.on("data", (chunk) => {
    serverLog += chunk;
  });
  await waitForServer(baseUrl);

  testAuth = createTestAuth(baseUrl);
}, 200_000);

afterAll(() => {
  stopServer();
});

type Result = { code: number | null; stdout: string; stderr: string };

function spawnCli(args: string[]) {
  const child = spawn(process.execPath, [cliBin, ...args], {
    env: {
      ...process.env,
      TODO_CAT_URL: baseUrl,
      TODO_CAT_CONFIG_DIR: configDir,
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise<Result>((resolveDone) => {
    child.on("close", (code) => resolveDone({ code, stdout, stderr }));
  });
  return { child, done, output: () => stdout };
}

function cli(...args: string[]): Promise<Result> {
  return spawnCli(args).done;
}

async function cliJson<T>(
  parser: { parse(input: unknown): T },
  ...args: string[]
): Promise<T> {
  const result = await cli(...args, "--json");
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  return parser.parse(JSON.parse(result.stdout));
}

const credentialsFile = () => join(configDir, "credentials.json");

describe("todo-cat CLI", () => {
  let token: string;
  let todo: Todo;

  test("needs a login first", async () => {
    const result = await cli("list", "--json");
    expect(result.code).toBe(3);
    expect(JSON.parse(result.stderr).error.code).toBe("not-logged-in");
  });

  test("login: device flow, approved without a browser", async () => {
    const login = spawnCli(["login", "--json"]);

    // The first JSON line carries the code to approve.
    const deadline = Date.now() + 30_000;
    while (!login.output().includes("\n") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const firstLine = login.output().split("\n")[0] ?? "";
    const code = z
      .object({ userCode: z.string(), verificationUriComplete: z.string() })
      .parse(JSON.parse(firstLine));
    expect(code.verificationUriComplete).toBe(
      `${baseUrl}/device?user_code=${code.userCode}`,
    );

    // What a signed-in user does on /device: look the code up, approve it.
    const { test: helpers } = await testAuth.$context;
    const user = await helpers.saveUser(
      helpers.createUser({ name: "Lissie", email: "lissie@example.com" }),
    );
    const headers = await helpers.getAuthHeaders({ userId: user.id });
    await testAuth.api.deviceVerify({
      query: { user_code: code.userCode },
      headers,
    });
    await testAuth.api.deviceApprove({
      body: { userCode: code.userCode },
      headers,
    });

    const result = await login.done;
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const lastLine = result.stdout.trim().split("\n").at(-1) ?? "";
    expect(JSON.parse(lastLine)).toMatchObject({
      loggedIn: true,
      user: { email: "lissie@example.com" },
    });

    // The token is stored, readable by the owner only, and never printed.
    const saved = z
      .object({ server: z.string(), token: z.string() })
      .parse(JSON.parse(readFileSync(credentialsFile(), "utf8")));
    token = saved.token;
    expect(saved.server).toBe(baseUrl);
    expect(result.stdout + result.stderr).not.toContain(token);
    if (process.platform !== "win32") {
      expect(statSync(credentialsFile()).mode & 0o777).toBe(0o600);
    }
  }, 60_000);

  test("whoami", async () => {
    const text = await cli("whoami");
    expect(text.code).toBe(0);
    expect(text.stdout).toContain("lissie@example.com");

    const json = await cliJson(
      z.object({ user: z.object({ email: z.string() }) }),
      "whoami",
    );
    expect(json.user.email).toBe("lissie@example.com");
  });

  test("add", async () => {
    todo = await cliJson(todoSchema, "add", "Buy tuna", "--due", "2026-10-12");
    expect(todo).toMatchObject({
      title: "Buy tuna",
      dueDate: "2026-10-12",
      done: false,
    });
  });

  test("add rejects an invalid date with the contract's error code", async () => {
    const result = await cli("add", "Nope", "--due", "tomorrow", "--json");
    expect(result.code).toBe(5);
    expect(JSON.parse(result.stderr).error.code).toBe("validation-failed");
  });

  test("list", async () => {
    const todos = await cliJson(z.array(todoSchema), "list");
    expect(todos.map((t) => t.id)).toEqual([todo.id]);

    const text = await cli("list", "--status", "open");
    expect(text.stdout).toContain("Buy tuna");
    expect(text.stdout).toContain(todo.id);
  });

  test("done", async () => {
    const done = await cliJson(todoSchema, "done", todo.id);
    expect(done.done).toBe(true);
    expect(done.completedAt).not.toBeNull();
    expect(await cliJson(z.array(todoSchema), "list", "-s", "open")).toEqual(
      [],
    );
  });

  test("delete needs --yes", async () => {
    const result = await cli("delete", todo.id);
    expect(result.code).toBe(5);
    expect(result.stderr).toContain("--yes");
    expect(await cliJson(z.array(todoSchema), "list")).toHaveLength(1);
  });

  test("delete", async () => {
    const result = await cli("delete", todo.id, "--yes", "--json");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ deleted: todo.id });
    expect(await cliJson(z.array(todoSchema), "list")).toEqual([]);
  });

  test("an unknown id is exit code 4", async () => {
    const result = await cli("get", todo.id, "--json");
    expect(result.code).toBe(4);
    expect(JSON.parse(result.stderr).error.code).toBe("todo-not-found");
  });

  test("a bad command is a usage error", async () => {
    expect((await cli("frobnicate")).code).toBe(2);
  });

  test("logout revokes the session and forgets the token", async () => {
    const result = await cli("logout");
    expect(result.code).toBe(0);
    expect(existsSync(credentialsFile())).toBe(false);

    // Revoked on the server, not just forgotten locally.
    const revoked = await fetch(`${baseUrl}/api/todos`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revoked.status).toBe(401);
  });

  test("whoami fails after logout", async () => {
    const result = await cli("whoami", "--json");
    expect(result.code).toBe(3);
    expect(JSON.parse(result.stderr).error.code).toBe("not-logged-in");
  });
});
