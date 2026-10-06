// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RequestContext } from "@mastra/core/request-context";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-lissie-tools-test-"));
const alice = "user-alice";
const bob = "user-bob";

let db: typeof import("@/lib/db").db;
let schema: typeof import("@/lib/schema");
let service: typeof import("@/lib/todo-service");
let tools: typeof import("@/lib/lissie-tools");

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  schema = await import("@/lib/schema");
  service = await import("@/lib/todo-service");
  tools = await import("@/lib/lissie-tools");
  for (const id of [alice, bob]) {
    await db
      .insert(schema.user)
      .values({ id, name: id, email: `${id}@example.com` });
  }
});

afterAll(() => {
  db.$client.close();
  vi.unstubAllEnvs();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps the SQLite file locked until the process exits.
  }
});

beforeEach(async () => {
  await db.delete(schema.todos);
});

// What lib/copilotkit.ts builds for a request: the user id comes from the
// session, so it is the only thing in here.
function asUser(userId: unknown) {
  const requestContext = new RequestContext();
  requestContext.set(tools.USER_ID_KEY, userId);
  return { requestContext };
}

// The tools run inside Mastra; calling `execute` directly skips its input
// validation, so inputs are passed already parsed.
type Run = (input: never, context: never) => Promise<unknown>;
const run = (tool: { execute?: unknown }, input: unknown, ctx: unknown) =>
  (tool.execute as Run)(input as never, ctx as never);

describe("listTodos", () => {
  test("lists only the signed-in user's open todos by default", async () => {
    const mine = await service.addTodo(alice, { title: "mine", dueDate: null });
    const finished = await service.addTodo(alice, {
      title: "finished",
      dueDate: null,
    });
    await service.updateTodo(alice, finished.id, { done: true });
    await service.addTodo(bob, { title: "bobs", dueDate: null });

    const open = await run(
      tools.listTodosTool,
      { status: "open" },
      asUser(alice),
    );
    expect(open).toEqual({ todos: [mine] });

    const all = (await run(
      tools.listTodosTool,
      { status: "all" },
      asUser(alice),
    )) as { todos: { title: string }[] };
    expect(all.todos.map((todo) => todo.title).sort()).toEqual([
      "finished",
      "mine",
    ]);
  });

  test("filters by text", async () => {
    await service.addTodo(alice, { title: "Feed the cat", dueDate: null });
    await service.addTodo(alice, { title: "Pay rent", dueDate: null });
    const result = (await run(
      tools.listTodosTool,
      { status: "all", q: "cat" },
      asUser(alice),
    )) as { todos: { title: string }[] };
    expect(result.todos.map((todo) => todo.title)).toEqual(["Feed the cat"]);
  });
});

describe("addTodo", () => {
  test("adds the todo for the signed-in user", async () => {
    const result = (await run(
      tools.addTodoTool,
      { title: "buy milk", dueDate: "2026-10-07" },
      asUser(alice),
    )) as { todo: { title: string; dueDate: string } };
    expect(result.todo).toMatchObject({
      title: "buy milk",
      dueDate: "2026-10-07",
    });
    expect(await service.listTodos(alice)).toHaveLength(1);
    expect(await service.listTodos(bob)).toHaveLength(0);
  });

  test("a user id in the model's input is ignored", async () => {
    await run(
      tools.addTodoTool,
      { title: "sneaky", dueDate: null, userId: bob },
      asUser(alice),
    );
    expect(await service.listTodos(bob)).toHaveLength(0);
    expect(await service.listTodos(alice)).toHaveLength(1);
  });
});

describe("setTodoDone", () => {
  test("marks the user's todo done and can reopen it", async () => {
    const todo = await service.addTodo(alice, { title: "x", dueDate: null });
    const done = (await run(
      tools.setTodoDoneTool,
      { id: todo.id, done: true },
      asUser(alice),
    )) as { todo: { done: boolean; completedAt: string | null } };
    expect(done.todo.done).toBe(true);
    expect(done.todo.completedAt).not.toBeNull();

    const reopened = (await run(
      tools.setTodoDoneTool,
      { id: todo.id, done: false },
      asUser(alice),
    )) as { todo: { done: boolean } };
    expect(reopened.todo.done).toBe(false);
  });

  test("another user's todo is not found and stays untouched", async () => {
    const todo = await service.addTodo(alice, { title: "x", dueDate: null });
    const result = await run(
      tools.setTodoDoneTool,
      { id: todo.id, done: true },
      asUser(bob),
    );
    expect(result).toEqual({ error: "todo-not-found" });
    expect(await service.getTodo(alice, todo.id)).toMatchObject({
      done: false,
    });
  });

  test("an unknown id is not found", async () => {
    const result = await run(
      tools.setTodoDoneTool,
      { id: "nope", done: true },
      asUser(alice),
    );
    expect(result).toEqual({ error: "todo-not-found" });
  });
});

describe("the user id", () => {
  const inputs = {
    listTodos: { status: "all" },
    addTodo: { title: "x", dueDate: null },
    setTodoDone: { id: "x", done: true },
  } as const;

  test.each(Object.keys(inputs) as (keyof typeof inputs)[])(
    "%s refuses to run without a user in the context",
    async (name) => {
      const tool = tools.lissieTools[name];
      const input = inputs[name];
      for (const bad of [undefined, "", 42, null]) {
        await expect(run(tool, input, asUser(bad))).rejects.toThrow(
          /signed-in user/,
        );
      }
      await expect(
        run(tool, input, { requestContext: new RequestContext() }),
      ).rejects.toThrow(/signed-in user/);
      await expect(run(tool, input, {})).rejects.toThrow(/signed-in user/);
      expect(await service.listTodos(alice)).toHaveLength(0);
      expect(await service.listTodos(bob)).toHaveLength(0);
    },
  );

  test("no input schema lets the model name a user", () => {
    for (const tool of Object.values(tools.lissieTools)) {
      const standard = (
        tool.inputSchema as unknown as {
          "~standard": {
            jsonSchema: {
              input: (o: { target: string }) => {
                properties: Record<string, unknown>;
              };
            };
          };
        }
      )["~standard"];
      const fields = Object.keys(
        standard.jsonSchema.input({ target: "draft-2020-12" }).properties,
      );
      expect(fields.length).toBeGreaterThan(0);
      expect(fields).not.toContain("userId");
      expect(fields).not.toContain("user");
    }
  });
});
