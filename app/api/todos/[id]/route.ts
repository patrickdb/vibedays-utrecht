import { updateTodoInputSchema } from "@todo-cat/contract";
import { parseJsonBody, withUser } from "@/lib/rest";
import { deleteTodo, getTodo, updateTodo } from "@/lib/todo-service";

export function GET(request: Request, ctx: RouteContext<"/api/todos/[id]">) {
  return withUser(request, async (userId) => {
    const { id } = await ctx.params;
    return Response.json(await getTodo(userId, id));
  });
}

export function PATCH(request: Request, ctx: RouteContext<"/api/todos/[id]">) {
  return withUser(request, async (userId) => {
    const { id } = await ctx.params;
    const patch = await parseJsonBody(request, updateTodoInputSchema);
    return Response.json(await updateTodo(userId, id, patch));
  });
}

export function DELETE(request: Request, ctx: RouteContext<"/api/todos/[id]">) {
  return withUser(request, async (userId) => {
    const { id } = await ctx.params;
    await deleteTodo(userId, id);
    return new Response(null, { status: 204 });
  });
}
