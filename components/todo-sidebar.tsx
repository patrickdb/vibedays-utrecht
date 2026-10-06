import type { Todo } from "@todo-cat/contract";

// Read-only: Lissie is the browser's only write path for now. The page renders
// it on the server; the chat asks the router to refresh it after a tool call.
export function TodoSidebar({ todos }: { todos: Todo[] }) {
  const open = todos.filter((todo) => !todo.done);
  const done = todos.filter((todo) => todo.done);
  return (
    <aside
      aria-label="Your list"
      className="flex max-h-48 flex-col gap-4 overflow-y-auto border-t border-zinc-200 bg-white p-4 md:max-h-none md:w-72 md:shrink-0 md:border-t-0 md:border-l dark:border-zinc-800 dark:bg-zinc-950"
    >
      <TodoGroup title="Open" todos={open} empty="Nothing open. Suspicious." />
      <TodoGroup title="Done" todos={done} empty="Nothing finished yet." />
    </aside>
  );
}

function TodoGroup({
  title,
  todos,
  empty,
}: {
  title: string;
  todos: Todo[];
  empty: string;
}) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title} ({todos.length})
      </h2>
      {todos.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={
                todo.done
                  ? "text-sm text-zinc-500 line-through"
                  : "text-sm text-zinc-900 dark:text-zinc-100"
              }
            >
              {todo.title}
              {todo.dueDate ? (
                <span className="ml-2 text-xs text-zinc-500">
                  due {todo.dueDate}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
