import { addTodoInputSchema, todoFilterSchema } from "@todo-cat/contract";
import { parse, parseJsonBody, withUser } from "@/lib/rest";
import { addTodo, listTodos } from "@/lib/todo-service";

export function GET(request: Request) {
  return withUser(request, async (userId) => {
    const params = new URL(request.url).searchParams;
    const filter = parse(todoFilterSchema, {
      status: params.get("status") ?? undefined,
      q: params.get("q") ?? undefined,
    });
    const todos = await listTodos(userId, filter);
    return Response.json(todos);
  });
}

export function POST(request: Request) {
  return withUser(request, async (userId) => {
    const input = await parseJsonBody(request, addTodoInputSchema);
    return Response.json(await addTodo(userId, input), { status: 201 });
  });
}
