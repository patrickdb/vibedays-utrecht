// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { tryParseA2UIOperations } from "@ag-ui/a2ui-middleware";
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
import { lissieCatalog } from "@/components/a2ui/catalog";
import { PROGRESS_CATALOG_ID, PROGRESS_SURFACE_ID } from "@/lib/progress-card";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const dir = mkdtempSync(join(tmpdir(), "todo-cat-lissie-progress-test-"));
const alice = "user-alice";
const bob = "user-bob";

let db: typeof import("@/lib/db").db;
let schema: typeof import("@/lib/schema");
let service: typeof import("@/lib/todo-service");
let progress: typeof import("@/lib/lissie-progress");
let tools: typeof import("@/lib/lissie-tools");

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "test.db")}`);
  ({ db } = await import("@/lib/db"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  schema = await import("@/lib/schema");
  service = await import("@/lib/todo-service");
  tools = await import("@/lib/lissie-tools");
  progress = await import("@/lib/lissie-progress");
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

async function showProgress(userId: string) {
  const requestContext = new RequestContext();
  requestContext.set(tools.USER_ID_KEY, userId);
  // Calling `execute` directly skips Mastra's validation; the input is empty.
  const execute = progress.showProgressTool.execute as (
    input: never,
    context: never,
  ) => Promise<{ a2ui_operations: Record<string, unknown>[] }>;
  return execute({} as never, { requestContext } as never);
}

async function seed(userId: string, titles: string[], doneCount: number) {
  for (const [i, title] of titles.entries()) {
    const todo = await service.addTodo(userId, { title, dueDate: null });
    if (i < doneCount)
      await service.updateTodo(userId, todo.id, { done: true });
  }
}

describe("showProgress", () => {
  test("returns well-formed A2UI operations", async () => {
    await seed(alice, ["a", "b", "c"], 1);
    const result = await showProgress(alice);

    // The middleware must recognise the tool result as an A2UI container.
    const parsed = tryParseA2UIOperations(JSON.stringify(result));
    expect(parsed?.operations).toHaveLength(3);

    const [create, components, data] = result.a2ui_operations as [
      { version: string; createSurface: Record<string, unknown> },
      {
        version: string;
        updateComponents: {
          surfaceId: string;
          components: {
            id: string;
            component: string;
            child?: string;
            children?: string[];
          }[];
        };
      },
      {
        version: string;
        updateDataModel: { surfaceId: string; value: Record<string, number> };
      },
    ];
    expect(create.createSurface).toEqual({
      surfaceId: PROGRESS_SURFACE_ID,
      catalogId: PROGRESS_CATALOG_ID,
    });
    for (const op of result.a2ui_operations) expect(op.version).toBe("v0.9");

    const list = components.updateComponents.components;
    const ids = list.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("root");
    for (const c of list) {
      for (const ref of [
        ...(c.children ?? []),
        ...(c.child ? [c.child] : []),
      ]) {
        expect(ids).toContain(ref);
      }
    }
    // The tree binds to the data model by path and holds no figures itself.
    const bound = [...JSON.stringify(list).matchAll(/"path":"\/(\w+)"/g)].map(
      (m) => m[1],
    );
    expect(bound.length).toBeGreaterThan(0);
    for (const key of bound)
      expect(Object.keys(data.updateDataModel.value)).toContain(key);
    // JSON.parse visits every value; none may be a number.
    JSON.parse(JSON.stringify(list), (_key, value) => {
      expect(typeof value).not.toBe("number");
      return value;
    });
    expect(components.updateComponents.surfaceId).toBe(PROGRESS_SURFACE_ID);
    expect(data.updateDataModel.surfaceId).toBe(PROGRESS_SURFACE_ID);
  });

  test("the renderer's own message processor accepts them against the catalog", async () => {
    await seed(alice, ["a", "b", "c", "d"], 3);
    const { a2ui_operations } = await showProgress(alice);

    const processor = new MessageProcessor([lissieCatalog]);
    processor.processMessages(a2ui_operations as never);
    const surface = processor.model.getSurface(PROGRESS_SURFACE_ID);
    expect(surface?.componentsModel.get("bar")?.type).toBe("ProgressBar");
    expect(surface?.dataModel.get("/done")).toBe(3);
  });

  test("the numbers match the rows, and only the user's own", async () => {
    await seed(alice, ["a", "b", "c", "d", "e"], 2);
    await seed(bob, ["bobs 1", "bobs 2"], 2);

    const ops = (await showProgress(alice)).a2ui_operations;
    const data = ops.find((op) => "updateDataModel" in op) as {
      updateDataModel: { value: unknown };
    };
    expect(data.updateDataModel.value).toEqual({ total: 5, done: 2, open: 3 });
  });

  test("an empty list is all zeros", async () => {
    const ops = (await showProgress(alice)).a2ui_operations;
    const data = ops.find((op) => "updateDataModel" in op) as {
      updateDataModel: { value: unknown };
    };
    expect(data.updateDataModel.value).toEqual({ total: 0, done: 0, open: 0 });
  });

  test("fails without a signed-in user", async () => {
    await expect(showProgress(undefined as unknown as string)).rejects.toThrow(
      "No signed-in user",
    );
  });
});

describe("runtime", () => {
  test("never injects a tool that generates UI", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/copilotkit.ts", "utf8"),
    );
    expect(source).toMatch(/a2ui:\s*\{\s*injectA2UITool:\s*false\s*\}/);
  });
});
