// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-service-test-"));
const alice = "user-alice";
const bob = "user-bob";

let db: typeof import("@/lib/db").db;
let schema: typeof import("@/lib/schema");
let service: typeof import("@/lib/todo-service");

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  schema = await import("@/lib/schema");
  service = await import("@/lib/todo-service");
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
    // Windows keeps the SQLite file locked until the process exits; the file is
    // in the OS temp dir, so leaving it behind is harmless.
  }
});

async function reset() {
  await db.delete(schema.todos);
}

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "todo-not-found" });
}

describe("addTodo", () => {
  test("creates an open todo owned by the user", async () => {
    await reset();
    const now = new Date("2026-10-01T10:00:00.000Z");
    const todo = await service.addTodo(
      alice,
      { title: "Feed Lissie", dueDate: "2026-10-03" },
      now,
    );
    expect(todo).toEqual({
      id: expect.any(String),
      title: "Feed Lissie",
      dueDate: "2026-10-03",
      done: false,
      createdAt: "2026-10-01T10:00:00.000Z",
      completedAt: null,
    });
    expect(await service.getTodo(alice, todo.id)).toEqual(todo);
  });

  test("keeps a due date as the plain date it was given", async () => {
    await reset();
    const todo = await service.addTodo(alice, {
      title: "Midnight",
      dueDate: "2026-01-01",
    });
    expect(todo.dueDate).toBe("2026-01-01");
  });

  test("stays invisible to the other user", async () => {
    await reset();
    const todo = await service.addTodo(alice, { title: "Mine", dueDate: null });
    expect(await service.listTodos(bob)).toEqual([]);
    await expectNotFound(service.getTodo(bob, todo.id));
  });
});

describe("listTodos", () => {
  test("lists the newest first and only the user's own", async () => {
    await reset();
    const first = await service.addTodo(
      alice,
      { title: "First", dueDate: null },
      new Date("2026-10-01T10:00:00Z"),
    );
    const second = await service.addTodo(
      alice,
      { title: "Second", dueDate: null },
      new Date("2026-10-02T10:00:00Z"),
    );
    await service.addTodo(bob, { title: "Bob's", dueDate: null });

    expect((await service.listTodos(alice)).map((t) => t.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect((await service.listTodos(bob)).map((t) => t.title)).toEqual([
      "Bob's",
    ]);
  });

  test("filters by status", async () => {
    await reset();
    const open = await service.addTodo(alice, { title: "Open", dueDate: null });
    const done = await service.addTodo(alice, { title: "Done", dueDate: null });
    await service.updateTodo(alice, done.id, { done: true });
    const bobDone = await service.addTodo(bob, { title: "Bob", dueDate: null });
    await service.updateTodo(bob, bobDone.id, { done: true });

    const ids = async (status: "open" | "done" | "all") =>
      (await service.listTodos(alice, { status })).map((t) => t.id).sort();
    expect(await ids("open")).toEqual([open.id]);
    expect(await ids("done")).toEqual([done.id]);
    expect(await ids("all")).toEqual([open.id, done.id].sort());
  });

  test("filters by text, case-insensitively and without wildcards", async () => {
    await reset();
    await service.addTodo(alice, { title: "Buy Salmon", dueDate: null });
    await service.addTodo(alice, { title: "100% effort", dueDate: null });
    await service.addTodo(alice, { title: "Nap", dueDate: null });
    await service.addTodo(bob, { title: "Salmon for Bob", dueDate: null });

    const titles = async (q: string) =>
      (await service.listTodos(alice, { status: "all", q })).map(
        (t) => t.title,
      );
    expect(await titles("salmon")).toEqual(["Buy Salmon"]);
    expect(await titles("%")).toEqual(["100% effort"]);
    expect(await titles("_")).toEqual([]);
  });
});

describe("getTodo", () => {
  test("another user's todo is not found, like a missing one", async () => {
    await reset();
    const todo = await service.addTodo(alice, { title: "Mine", dueDate: null });
    await expectNotFound(service.getTodo(bob, todo.id));
    await expectNotFound(service.getTodo(alice, "no-such-id"));
  });
});

describe("updateTodo", () => {
  test("changes title and due date, and clears the due date with null", async () => {
    await reset();
    const todo = await service.addTodo(alice, {
      title: "Old",
      dueDate: "2026-10-03",
    });
    const renamed = await service.updateTodo(alice, todo.id, {
      title: "New",
      dueDate: "2026-10-09",
    });
    expect(renamed).toMatchObject({ title: "New", dueDate: "2026-10-09" });

    const cleared = await service.updateTodo(alice, todo.id, { dueDate: null });
    expect(cleared).toMatchObject({ title: "New", dueDate: null });
  });

  test("sets completedAt when marked done and clears it on reopen", async () => {
    await reset();
    const todo = await service.addTodo(alice, { title: "Task", dueDate: null });
    const finished = new Date("2026-10-02T08:30:00.000Z");

    const done = await service.updateTodo(
      alice,
      todo.id,
      { done: true },
      finished,
    );
    expect(done).toMatchObject({
      done: true,
      completedAt: "2026-10-02T08:30:00.000Z",
    });

    // Marking an already finished todo done again keeps the original time.
    const again = await service.updateTodo(
      alice,
      todo.id,
      { done: true },
      new Date("2026-10-05T00:00:00Z"),
    );
    expect(again.completedAt).toBe("2026-10-02T08:30:00.000Z");

    const reopened = await service.updateTodo(alice, todo.id, { done: false });
    expect(reopened).toMatchObject({ done: false, completedAt: null });
  });

  test("an empty patch changes nothing", async () => {
    await reset();
    const todo = await service.addTodo(alice, { title: "Task", dueDate: null });
    expect(await service.updateTodo(alice, todo.id, {})).toEqual(todo);
  });

  test("never changes another user's todo", async () => {
    await reset();
    const todo = await service.addTodo(alice, { title: "Mine", dueDate: null });
    await expectNotFound(
      service.updateTodo(bob, todo.id, { title: "Hijacked", done: true }),
    );
    expect(await service.getTodo(alice, todo.id)).toEqual(todo);
  });
});

describe("deleteTodo", () => {
  test("removes the user's todo", async () => {
    await reset();
    const todo = await service.addTodo(alice, { title: "Gone", dueDate: null });
    await service.deleteTodo(alice, todo.id);
    await expectNotFound(service.getTodo(alice, todo.id));
    await expectNotFound(service.deleteTodo(alice, todo.id));
  });

  test("never deletes another user's todo", async () => {
    await reset();
    const todo = await service.addTodo(alice, { title: "Mine", dueDate: null });
    await expectNotFound(service.deleteTodo(bob, todo.id));
    expect(await service.getTodo(alice, todo.id)).toEqual(todo);
  });
});

describe("ownership", () => {
  test("deleting a user deletes their todos and nobody else's", async () => {
    await reset();
    await db
      .insert(schema.user)
      .values({ id: "user-carol", name: "Carol", email: "carol@example.com" });
    await service.addTodo("user-carol", { title: "Carol's", dueDate: null });
    await service.addTodo(alice, { title: "Alice's", dueDate: null });

    await db.delete(schema.user).where(eq(schema.user.id, "user-carol"));

    expect(await service.listTodos("user-carol")).toEqual([]);
    expect(await service.listTodos(alice)).toHaveLength(1);
  });
});
