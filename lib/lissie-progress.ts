import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { userIdOf } from "@/lib/lissie-tools";
import { progressOperations } from "@/lib/progress-card";
import { listTodos } from "@/lib/todo-service";

// Shows the user how far along the list is, as a card. The counts come from the
// todo service, never from the model, and the result is the A2UI operations
// themselves: CopilotKit's A2UI middleware spots the `a2ui_operations` key in a
// tool result and renders it, so no second model call designs the card (see
// tech-docs/agent.md). The tree lives in lib/progress-card.ts.
export const showProgressTool = createTool({
  id: "showProgress",
  description:
    "Show the user a progress card for their whole list: how many todos there are, how many are done and how many are still open. Use it when they ask how they are doing or how much is left. The card shows the numbers itself; do not repeat them, comment on them in a sentence.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    a2ui_operations: z.array(z.record(z.string(), z.unknown())),
  }),
  execute: async (_input, { requestContext }) => {
    const todos = await listTodos(userIdOf(requestContext), { status: "all" });
    const done = todos.filter((todo) => todo.done).length;
    return {
      a2ui_operations: progressOperations({
        total: todos.length,
        done,
        open: todos.length - done,
      }),
    };
  },
});
