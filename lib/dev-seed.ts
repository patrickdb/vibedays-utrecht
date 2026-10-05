import "server-only";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/schema";
import { addTodo, deleteTodo, listTodos, updateTodo } from "@/lib/todo-service";

export const DEMO_EMAIL = "demo@todo-cat.dev";
export const DEMO_PASSWORD = "cat-person-2026";

const DAY = 24 * 60 * 60 * 1000;

// Offsets are in days relative to the day of the seed run, so the data always
// looks recent: `created` is how long ago the todo was added, `due` is a day
// offset (negative: overdue), `doneAfter` how many days after creation it was
// finished.
const DEMO_TODOS = [
  { title: "Restock the salmon treats", created: 14, due: -10, doneAfter: 2 },
  { title: "Knock the glass off the table", created: 13, doneAfter: 0 },
  { title: "Book the vet checkup", created: 12, due: -5 },
  { title: "Claim the good sunny spot", created: 10, due: -3, doneAfter: 1 },
  { title: "Ignore the new cat tree", created: 9, doneAfter: 3 },
  { title: "Interrogate the printer", created: 8, due: 4 },
  {
    title: "Deliver a gift to the neighbours",
    created: 6,
    due: -1,
    doneAfter: 4,
  },
  { title: "Demand breakfast at 5am", created: 5, due: 0 },
  { title: "Refresh the scratching post", created: 4, due: 6, doneAfter: 1 },
  { title: "Judge the guests", created: 3, due: 2 },
  { title: "Reorganise the sock drawer", created: 2 },
  { title: "Nap (urgent)", created: 1, due: 1 },
];

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function ensureDemoUser(): Promise<string> {
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEMO_EMAIL));
  if (existing) return existing.id;
  const { user: created } = await auth.api.signUpEmail({
    body: { name: "Demo", email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  return created.id;
}

// Idempotent: the demo user is created once and its todos are replaced, so
// running it again with the same `now` (or on the same day) leaves the same state.
export async function seedDemo(now = new Date()): Promise<{ userId: string }> {
  const userId = await ensureDemoUser();
  for (const todo of await listTodos(userId)) {
    await deleteTodo(userId, todo.id);
  }

  // Timestamps sit at noon UTC of their day, independent of the time of the run.
  const today = Math.floor(now.getTime() / DAY) * DAY + DAY / 2;
  for (const seed of DEMO_TODOS) {
    const createdAt = new Date(today - seed.created * DAY);
    const added = await addTodo(
      userId,
      {
        title: seed.title,
        dueDate:
          seed.due === undefined ? null : isoDate(today + seed.due * DAY),
      },
      createdAt,
    );
    if (seed.doneAfter !== undefined) {
      const completedAt = new Date(createdAt.getTime() + seed.doneAfter * DAY);
      await updateTodo(userId, added.id, { done: true }, completedAt);
    }
  }
  return { userId };
}
