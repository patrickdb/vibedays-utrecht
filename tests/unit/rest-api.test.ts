// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { errorBodySchema, type Todo, todoSchema } from "@todo-cat/contract";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-rest-test-"));
const password = "correct horse battery";

let db: typeof import("@/lib/db").db;
let collection: typeof import("@/app/api/todos/route");
let item: typeof import("@/app/api/todos/[id]/route");
let aliceToken: string;
let bobToken: string;

// A real sign-in: the bearer token is the `set-auth-token` response header.
async function signUp(name: string): Promise<string> {
  const { auth } = await import("@/lib/auth");
  const email = `${name}@example.com`;
  await auth.api.signUpEmail({ body: { name, email, password } });
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token");
  if (!token) throw new Error("sign-in returned no bearer token");
  return token;
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  collection = await import("@/app/api/todos/route");
  item = await import("@/app/api/todos/[id]/route");
  aliceToken = await signUp("alice");
  bobToken = await signUp("bob");
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

function request(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; rawBody?: string } = {},
): Request {
  const headers = new Headers();
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  let body = options.rawBody;
  if (options.body !== undefined) body = JSON.stringify(options.body);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    body,
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) } as RouteContext<"/api/todos/[id]">;
}

const api = {
  list: (token?: string, query = "") =>
    collection.GET(request("GET", `/api/todos${query}`, { token })),
  add: (token?: string, body?: unknown, rawBody?: string) =>
    collection.POST(request("POST", "/api/todos", { token, body, rawBody })),
  get: (id: string, token?: string) =>
    item.GET(request("GET", `/api/todos/${id}`, { token }), ctx(id)),
  update: (id: string, token?: string, body?: unknown) =>
    item.PATCH(request("PATCH", `/api/todos/${id}`, { token, body }), ctx(id)),
  remove: (id: string, token?: string) =>
    item.DELETE(request("DELETE", `/api/todos/${id}`, { token }), ctx(id)),
};

async function expectError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  expect(response.status).toBe(status);
  expect(errorBodySchema.parse(await response.json()).error.code).toBe(code);
}

describe("401 unauthorized", () => {
  const endpoints: [string, (token?: string) => Promise<Response>][] = [
    ["GET /api/todos", (token) => api.list(token)],
    ["POST /api/todos", (token) => api.add(token, { title: "x" })],
    ["GET /api/todos/:id", (token) => api.get("any", token)],
    [
      "PATCH /api/todos/:id",
      (token) => api.update("any", token, { done: true }),
    ],
    ["DELETE /api/todos/:id", (token) => api.remove("any", token)],
  ];

  test.each(endpoints)("%s without a token", async (_name, call) => {
    await expectError(await call(), 401, "unauthorized");
  });

  test.each(endpoints)("%s with an invalid token", async (_name, call) => {
    await expectError(await call("not-a-real-token"), 401, "unauthorized");
  });
});

describe("todo flow with a bearer token", () => {
  test("add, list, mark done, filter, delete", async () => {
    const added = await api.add(aliceToken, {
      title: "Feed Lissie",
      dueDate: "2026-10-06",
    });
    expect(added.status).toBe(201);
    const todo = todoSchema.parse(await added.json());
    expect(todo).toMatchObject({
      title: "Feed Lissie",
      dueDate: "2026-10-06",
      done: false,
    });

    const listed = await api.list(aliceToken);
    expect(listed.status).toBe(200);
    expect(todoSchema.array().parse(await listed.json())).toEqual([todo]);

    const updated = await api.update(todo.id, aliceToken, { done: true });
    expect(updated.status).toBe(200);
    const done = todoSchema.parse(await updated.json());
    expect(done.done).toBe(true);
    expect(done.completedAt).not.toBeNull();

    const ids = async (query: string): Promise<string[]> => {
      const todos = (await (
        await api.list(aliceToken, query)
      ).json()) as Todo[];
      return todos.map((t) => t.id);
    };
    expect(await ids("?status=open")).toEqual([]);
    expect(await ids("?status=done")).toEqual([todo.id]);
    expect(await ids("?q=lissie")).toEqual([todo.id]);
    expect(await ids("?q=dog")).toEqual([]);

    const fetched = await api.get(todo.id, aliceToken);
    expect(todoSchema.parse(await fetched.json())).toEqual(done);

    expect((await api.remove(todo.id, aliceToken)).status).toBe(204);
    expect(await ids("")).toEqual([]);
    await expectError(
      await api.get(todo.id, aliceToken),
      404,
      "todo-not-found",
    );
  });
});

describe("another user's todo", () => {
  test("is 404 on get, update and delete, and stays intact", async () => {
    const added = await api.add(aliceToken, { title: "Alice's secret" });
    const { id } = todoSchema.parse(await added.json());

    await expectError(await api.get(id, bobToken), 404, "todo-not-found");
    await expectError(
      await api.update(id, bobToken, { done: true }),
      404,
      "todo-not-found",
    );
    await expectError(await api.remove(id, bobToken), 404, "todo-not-found");
    expect(await (await api.list(bobToken)).json()).toEqual([]);

    const still = todoSchema.parse(
      await (await api.get(id, aliceToken)).json(),
    );
    expect(still).toMatchObject({ title: "Alice's secret", done: false });
  });
});

describe("invalid input", () => {
  test("add with a blank title", async () => {
    await expectError(
      await api.add(aliceToken, { title: "   " }),
      400,
      "validation-failed",
    );
  });

  test("add with a malformed due date", async () => {
    await expectError(
      await api.add(aliceToken, { title: "x", dueDate: "tomorrow" }),
      400,
      "validation-failed",
    );
  });

  test("add with a body that is not JSON", async () => {
    await expectError(
      await api.add(aliceToken, undefined, "{nope"),
      400,
      "validation-failed",
    );
  });

  test("update with no fields", async () => {
    await expectError(
      await api.update("any", aliceToken, {}),
      400,
      "validation-failed",
    );
  });

  test("list with an unknown status", async () => {
    await expectError(
      await api.list(aliceToken, "?status=maybe"),
      400,
      "validation-failed",
    );
  });
});
