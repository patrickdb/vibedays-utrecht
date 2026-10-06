// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-copilotkit-test-"));
const password = "correct horse battery";
const base = "http://localhost:3000/api/copilotkit";

let db: typeof import("@/lib/db").db;
let handler: typeof import("@/lib/copilotkit").handler;
let lissie: typeof import("@/lib/lissie");
const users: Record<string, { id: string; token: string }> = {};

async function signUp(name: string) {
  const { auth } = await import("@/lib/auth");
  const email = `${name}@example.com`;
  const { user } = await auth.api.signUpEmail({
    body: { name, email, password },
  });
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token");
  if (!token) throw new Error("sign-in returned no bearer token");
  users[name] = { id: user.id, token };
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  lissie = await import("@/lib/lissie");
  ({ handler } = await import("@/lib/copilotkit"));
  await signUp("alice");
  await signUp("bob");
}, 120_000); // importing Mastra and CopilotKit cold is slow

afterAll(() => {
  db.$client.close();
  vi.unstubAllEnvs();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows keeps the SQLite file locked until the process exits.
  }
});

const runInput = (threadId: unknown) => ({
  threadId,
  runId: "run-1",
  state: {},
  messages: [{ id: "m1", role: "user", content: "hi" }],
  tools: [],
  context: [],
  forwardedProps: {},
});

function call(
  who: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return handler(
    new Request(`${base}${path}`, {
      method,
      headers: {
        ...(who ? { authorization: `Bearer ${users[who].token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

const threadOf = (who: string) => lissie.threadIdFor(users[who].id);

type RouteCall = [method: string, path: string, body?: unknown];

// The routes the chat uses; they take a thread and are authorized by it.
function chatRoutes(thread: string): RouteCall[] {
  return [
    ["POST", "/agent/lissie/run", runInput(thread)],
    ["POST", "/agent/lissie/connect", runInput(thread)],
    ["POST", `/agent/lissie/stop/${thread}`, {}],
  ];
}

// Every other route of @copilotkit/runtime (`RouteInfo`), with `thread` wherever
// a route names one. None of them may be served.
function otherRoutes(thread: string): RouteCall[] {
  return [
    ["GET", "/inspector-metadata"],
    ["GET", "/inspector-learning"],
    ["GET", "/cpk-debug-events"],
    ["POST", "/transcribe", {}],
    ["POST", "/agent/lissie/suggest", runInput(thread)],
    ["POST", "/trajectory/t1/connect", {}],
    ["GET", "/threads"],
    ["POST", "/threads/subscribe", {}],
    ["GET", `/threads/${thread}/messages`],
    ["GET", `/threads/${thread}/events`],
    ["GET", `/threads/${thread}/state`],
    ["PATCH", `/threads/${thread}`, { name: "x" }],
    ["DELETE", `/threads/${thread}`],
    ["POST", `/threads/${thread}/archive`, {}],
    ["POST", "/threads/clear", {}],
    ["GET", "/memories"],
    ["POST", "/memories/recall", {}],
    ["POST", "/memories/subscribe", {}],
    ["DELETE", "/memories/m1"],
    ["POST", "/annotate", {}],
  ];
}

describe("authentication", () => {
  test.each([
    ["GET", "/info"] as RouteCall,
    ...chatRoutes("lissie-whoever"),
    ...otherRoutes("lissie-whoever"),
  ])("rejects an unauthenticated %s %s", async (method, path, body) => {
    const response = await call(null, method, path, body);
    expect(response.status).toBe(401);
  });

  test("rejects a bogus bearer token", async () => {
    const response = await handler(
      new Request(`${base}/info`, {
        headers: { authorization: "Bearer not-a-token" },
      }),
    );
    expect(response.status).toBe(401);
  });

  test("serves the runtime info, with only Lissie, to a signed-in user", async () => {
    const response = await call("alice", "GET", "/info");
    expect(response.status).toBe(200);
    const info = await response.json();
    expect(Object.keys(info.agents)).toEqual(["lissie"]);
  });
});

describe("thread ownership", () => {
  test("a thread id names its owner", () => {
    expect(lissie.userIdOfThread(threadOf("alice"))).toBe(users.alice.id);
    expect(lissie.userIdOfThread("lissie-")).toBeNull();
    expect(lissie.userIdOfThread("someone-else")).toBeNull();
  });

  test("Bob cannot run, connect or stop on Alice's thread", async () => {
    for (const [method, path, body] of chatRoutes(threadOf("alice"))) {
      const response = await call("bob", method, path, body);
      expect(response.status, `${method} ${path}`).toBe(403);
    }
  });

  test("a user cannot invent a thread of their own", async () => {
    for (const [method, path, body] of chatRoutes("some-other-thread")) {
      const response = await call("bob", method, path, body);
      expect(response.status, `${method} ${path}`).toBe(403);
    }
  });

  test("run and connect need a thread in the body", async () => {
    for (const path of ["/agent/lissie/run", "/agent/lissie/connect"]) {
      for (const threadId of [undefined, 42, "", null]) {
        const response = await call("bob", "POST", path, runInput(threadId));
        expect(response.status, `${path} ${String(threadId)}`).toBe(403);
      }
      const garbage = await handler(
        new Request(`${base}${path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${users.bob.token}` },
          body: "{not json",
        }),
      );
      expect(garbage.status).toBe(403);
    }
  });

  test("an unknown agent is not found", async () => {
    const response = await call(
      "alice",
      "POST",
      "/agent/other/connect",
      runInput(threadOf("alice")),
    );
    expect(response.status).toBe(404);
  });

  test("Alice may connect to and stop her own thread", async () => {
    const connect = await call(
      "alice",
      "POST",
      "/agent/lissie/connect",
      runInput(threadOf("alice")),
    );
    expect(connect.status).toBe(200);
    await connect.text();
    const stop = await call(
      "alice",
      "POST",
      `/agent/lissie/stop/${threadOf("alice")}`,
      {},
    );
    expect(stop.status).toBeLessThan(300);
    await stop.text();
  });
});

describe("routes the chat does not use", () => {
  // Nothing lists, reads, renames, deletes or wipes threads, whoever asks and
  // whichever thread, their own included, they name.
  test.each([
    ["alice", "alice"],
    ["alice", "bob"],
    ["bob", "bob"],
    ["bob", "alice"],
  ])("%s gets 404 for them on %s's thread", async (who, owner) => {
    for (const [method, path, body] of otherRoutes(threadOf(owner))) {
      const response = await call(who, method, path, body);
      expect(response.status, `${method} ${path}`).toBe(404);
    }
  });
});

describe("history", () => {
  test("a reconnect replays the conversation from Mastra memory", async () => {
    const memory = await lissie.mastra.getAgent("lissie").getMemory();
    if (!memory) throw new Error("Lissie has no memory");
    const threadId = threadOf("alice");
    const resourceId = users.alice.id;
    await memory.createThread({ threadId, resourceId });
    const lines: [string, "user" | "assistant", string][] = [
      ["m-user", "user", "Remind me to buy fish"],
      ["m-lissie", "assistant", "Fish. Naturally."],
    ];
    await memory.saveMessages({
      messages: lines.map(([id, role, text], i) => ({
        id,
        role,
        threadId,
        resourceId,
        createdAt: new Date(Date.now() + i),
        content: { format: 2 as const, parts: [{ type: "text", text }] },
      })),
    });

    const response = await call(
      "alice",
      "POST",
      "/agent/lissie/connect",
      runInput(threadId),
    );
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain("MESSAGES_SNAPSHOT");
    expect(stream).toContain("Remind me to buy fish");
    expect(stream).toContain("Fish. Naturally.");
  });

  test("a reconnect replays tool calls with their results", async () => {
    const memory = await lissie.mastra.getAgent("lissie").getMemory();
    if (!memory) throw new Error("Lissie has no memory");
    const threadId = threadOf("alice");
    const resourceId = users.alice.id;
    const todo = { id: "t1", title: "buy milk", done: false };
    await memory.saveMessages({
      messages: [
        {
          id: "m-user-2",
          role: "user",
          threadId,
          resourceId,
          createdAt: new Date(Date.now() + 100),
          content: {
            format: 2 as const,
            parts: [{ type: "text", text: "Add buy milk" }],
          },
        },
        {
          id: "m-lissie-2",
          role: "assistant",
          threadId,
          resourceId,
          createdAt: new Date(Date.now() + 101),
          content: {
            format: 2 as const,
            parts: [
              {
                type: "tool-invocation",
                toolInvocation: {
                  state: "result",
                  toolCallId: "call-1",
                  toolName: "addTodo",
                  args: { title: "buy milk", dueDate: null },
                  result: { todo },
                },
              },
              { type: "text", text: "Milk. Of course you forgot it." },
            ],
          },
        },
      ],
    });

    const response = await call(
      "alice",
      "POST",
      "/agent/lissie/connect",
      runInput(threadId),
    );
    const stream = await response.text();
    const snapshot = stream
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)))
      .find((event) => event.type === "MESSAGES_SNAPSHOT");
    const replayed = snapshot.messages.filter(
      (m: { id: string }) => m.id.includes("2") || m.id === "call-1-result",
    );
    expect(replayed).toEqual([
      { id: "m-user-2", role: "user", content: "Add buy milk" },
      {
        id: "m-lissie-2",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "addTodo",
              arguments: JSON.stringify({ title: "buy milk", dueDate: null }),
            },
          },
        ],
      },
      {
        id: "call-1-result",
        role: "tool",
        toolCallId: "call-1",
        content: JSON.stringify({ todo }),
      },
      {
        id: "m-lissie-2-1",
        role: "assistant",
        content: "Milk. Of course you forgot it.",
      },
    ]);
  });

  test("Bob's reconnect shows nothing of Alice's conversation", async () => {
    const response = await call(
      "bob",
      "POST",
      "/agent/lissie/connect",
      runInput(threadOf("bob")),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("Remind me to buy fish");
  });
});
