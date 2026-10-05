import "server-only";
import type {
  AddTodoInput,
  ErrorCode,
  Todo,
  TodoFilter,
  UpdateTodoInput,
} from "@todo-cat/contract";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { todos } from "@/lib/schema";

// The only module that touches the `todos` table. Every function takes the user
// id first and filters by it. `now` is a trailing parameter so tests and the
// dev seed can backdate `createdAt` and `completedAt`.

export class TodoError extends Error {
  constructor(
    readonly code: Exclude<ErrorCode, "unauthorized">,
    message: string,
  ) {
    super(message);
    this.name = "TodoError";
  }
}

type TodoRow = typeof todos.$inferSelect;

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.dueDate,
    done: row.done,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function owned(userId: string, id: string) {
  return and(eq(todos.userId, userId), eq(todos.id, id));
}

async function findRow(userId: string, id: string): Promise<TodoRow> {
  const [row] = await db.select().from(todos).where(owned(userId, id));
  // Another user's todo looks exactly like a missing one.
  if (!row) throw new TodoError("todo-not-found", `Todo ${id} not found`);
  return row;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

export async function listTodos(
  userId: string,
  filter: TodoFilter = { status: "all" },
): Promise<Todo[]> {
  const conditions = [eq(todos.userId, userId)];
  if (filter.status !== "all") {
    conditions.push(eq(todos.done, filter.status === "done"));
  }
  if (filter.q) {
    conditions.push(
      sql`${todos.title} like ${`%${escapeLike(filter.q)}%`} escape '\\'`,
    );
  }
  const rows = await db
    .select()
    .from(todos)
    .where(and(...conditions))
    .orderBy(desc(todos.createdAt), desc(todos.id));
  return rows.map(toTodo);
}

export async function getTodo(userId: string, id: string): Promise<Todo> {
  return toTodo(await findRow(userId, id));
}

export async function addTodo(
  userId: string,
  input: AddTodoInput,
  now = new Date(),
): Promise<Todo> {
  const [row] = await db
    .insert(todos)
    .values({
      id: crypto.randomUUID(),
      userId,
      title: input.title,
      dueDate: input.dueDate,
      createdAt: now,
    })
    .returning();
  return toTodo(row);
}

export async function updateTodo(
  userId: string,
  id: string,
  patch: UpdateTodoInput,
  now = new Date(),
): Promise<Todo> {
  const current = await findRow(userId, id);
  const changes: Partial<typeof todos.$inferInsert> = {};
  if (patch.title !== undefined) changes.title = patch.title;
  if (patch.dueDate !== undefined) changes.dueDate = patch.dueDate;
  if (patch.done !== undefined && patch.done !== current.done) {
    changes.done = patch.done;
    changes.completedAt = patch.done ? now : null;
  }
  if (Object.keys(changes).length === 0) return toTodo(current);

  const [row] = await db
    .update(todos)
    .set(changes)
    .where(owned(userId, id))
    .returning();
  return toTodo(row);
}

export async function deleteTodo(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(todos)
    .where(owned(userId, id))
    .returning({ id: todos.id });
  if (deleted.length === 0) {
    throw new TodoError("todo-not-found", `Todo ${id} not found`);
  }
}
