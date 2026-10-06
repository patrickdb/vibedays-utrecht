import "server-only";
import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import {
  addTodoInputSchema,
  todoSchema,
  todoStatusSchema,
} from "@todo-cat/contract";
import { z } from "zod";
import { addTodo, listTodos, TodoError, updateTodo } from "@/lib/todo-service";

// Lissie's tools are one more adapter on the todo service (see
// tech-docs/architecture.md): parse, resolve the user, call the service, map
// errors. The model fills in the input schemas below and nothing else; the user
// id is not among them. It comes from the request context, which lib/copilotkit.ts
// fills from the server-side session before the run starts.

export const USER_ID_KEY = "userId";

// A tool that runs without a server-supplied user must fail, never fall back to
// anything the model could have influenced.
export function userIdOf(requestContext: RequestContext | undefined): string {
  const userId = requestContext?.get(USER_ID_KEY);
  if (typeof userId !== "string" || userId === "") {
    throw new Error("No signed-in user in the request context");
  }
  return userId;
}

// A missing todo is an answer the model can react to, not a crash of the run.
const notFound = z.object({ error: z.literal("todo-not-found") });

async function inScope<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TodoError && error.code === "todo-not-found") {
      return { error: error.code } as const;
    }
    throw error;
  }
}

export const listTodosTool = createTool({
  id: "listTodos",
  description:
    "List the user's todos, newest first. Call it before changing a todo, to get its id, and whenever the user asks what is on the list.",
  inputSchema: z.object({
    status: todoStatusSchema
      .default("open")
      .describe("open, done or all; defaults to open"),
    q: z
      .string()
      .optional()
      .describe("only todos whose title contains this text"),
  }),
  outputSchema: z.object({ todos: z.array(todoSchema) }),
  execute: async (input, { requestContext }) => {
    const userId = userIdOf(requestContext);
    return { todos: await listTodos(userId, input) };
  },
});

export const addTodoTool = createTool({
  id: "addTodo",
  description:
    "Add a todo to the user's list. Only for something the user asked to add.",
  inputSchema: addTodoInputSchema,
  outputSchema: z.object({ todo: todoSchema }),
  execute: async (input, { requestContext }) => {
    const userId = userIdOf(requestContext);
    return { todo: await addTodo(userId, input) };
  },
});

export const setTodoDoneTool = createTool({
  id: "setTodoDone",
  description:
    "Mark a todo done, or open again with done=false. Get the id from listTodos.",
  inputSchema: z.object({
    id: z.string().describe("the todo's id, from listTodos"),
    done: z.boolean().default(true),
  }),
  outputSchema: z.union([z.object({ todo: todoSchema }), notFound]),
  execute: async ({ id, done }, { requestContext }) => {
    const userId = userIdOf(requestContext);
    return inScope(async () => ({
      todo: await updateTodo(userId, id, { done }),
    }));
  },
});

export const lissieTools = {
  listTodos: listTodosTool,
  addTodo: addTodoTool,
  setTodoDone: setTodoDoneTool,
};
