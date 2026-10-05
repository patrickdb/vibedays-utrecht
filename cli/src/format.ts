import type { Todo } from "@todo-cat/contract";

export function formatTodo(todo: Todo): string {
  const mark = todo.done ? "[x]" : "[ ]";
  const due = todo.dueDate ? `  (due ${todo.dueDate})` : "";
  return `${mark} ${todo.id}  ${todo.title}${due}`;
}

export function formatTodoDetails(todo: Todo): string {
  return [
    `id:        ${todo.id}`,
    `title:     ${todo.title}`,
    `status:    ${todo.done ? "done" : "open"}`,
    `due:       ${todo.dueDate ?? "-"}`,
    `created:   ${todo.createdAt}`,
    `completed: ${todo.completedAt ?? "-"}`,
  ].join("\n");
}

export function formatTodos(todos: Todo[]): string {
  return todos.length ? todos.map(formatTodo).join("\n") : "No to-dos.";
}
