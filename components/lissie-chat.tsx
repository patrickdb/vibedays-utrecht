"use client";

import {
  CopilotChat,
  CopilotKitProvider,
  useAgent,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { z } from "zod";
import { lissieCatalog } from "@/components/a2ui/catalog";

// `agentId` is the key Lissie is registered under in lib/lissie.ts; `threadId`
// is her one thread for this user (the server refuses any other). `sidebar` is
// the server-rendered todo list, kept next to the chat so it refreshes with it.
export function LissieChat({
  threadId,
  sidebar,
}: {
  threadId: string;
  sidebar: ReactNode;
}) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      agentId="lissie"
      enableInspector={false}
      a2ui={{ catalog: lissieCatalog }}
    >
      <ToolCallLines />
      <RefreshOnToolResult />
      <div className="flex h-full flex-col md:flex-row">
        <div className="min-h-0 min-w-0 flex-1">
          <CopilotChat
            agentId="lissie"
            threadId={threadId}
            className="h-full"
            labels={{
              welcomeMessageText:
                "Oh. You're here. Tell me what's on your list.",
              chatInputPlaceholder: "Tell Lissie what you need to do…",
            }}
          />
        </div>
        {sidebar}
      </div>
    </CopilotKitProvider>
  );
}

// Lissie changes the list on the server; the sidebar is a server component, so
// a router refresh re-reads it. Refreshing on a tool result shows the change
// while she is still commenting; the end of the run catches anything missed.
function RefreshOnToolResult() {
  const { agent } = useAgent({ agentId: "lissie" });
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    const { unsubscribe } = agent.subscribe({
      onToolCallResultEvent: refresh,
      onRunFinalized: refresh,
    });
    return unsubscribe;
  }, [agent, router]);
  return null;
}

// What a tool returned, or null while it runs or when it is not JSON.
function parseResult(result: string | undefined): unknown {
  if (result === undefined) return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function ToolLine({ tool, children }: { tool: string; children: ReactNode }) {
  return (
    <p
      data-tool-call={tool}
      className="my-1 text-xs italic text-zinc-500 dark:text-zinc-400"
    >
      {children}
    </p>
  );
}

// One readable line per call. The renderers stay registered after unmount, and
// the same lines come back from the history replayed after a restart.
function ToolCallLines() {
  useRenderTool(
    {
      name: "listTodos",
      parameters: z.object({ status: z.string().optional() }),
      render: ({ status, result }) => {
        if (status !== "complete")
          return <ToolLine tool="listTodos">Checking the list…</ToolLine>;
        const todos = field(parseResult(result), "todos");
        const count = Array.isArray(todos) ? todos.length : null;
        return (
          <ToolLine tool="listTodos">
            {count === null
              ? "Checked the list"
              : `Checked the list: ${count} ${count === 1 ? "todo" : "todos"}`}
          </ToolLine>
        );
      },
    },
    [],
  );
  useRenderTool(
    {
      name: "addTodo",
      parameters: z.object({
        title: z.string().optional(),
        dueDate: z.string().nullable().optional(),
      }),
      render: ({ status, parameters }) => {
        const due = parameters.dueDate ? `, due ${parameters.dueDate}` : "";
        const title = parameters.title ?? "a todo";
        return (
          <ToolLine tool="addTodo">
            {status === "complete"
              ? `Added “${title}”${due}`
              : `Adding “${title}”…`}
          </ToolLine>
        );
      },
    },
    [],
  );
  useRenderTool(
    {
      name: "setTodoDone",
      parameters: z.object({
        id: z.string().optional(),
        done: z.boolean().optional(),
      }),
      render: ({ status, parameters, result }) => {
        if (status !== "complete")
          return <ToolLine tool="setTodoDone">Updating the list…</ToolLine>;
        const title = field(field(parseResult(result), "todo"), "title");
        if (typeof title !== "string")
          return (
            <ToolLine tool="setTodoDone">Could not find that todo</ToolLine>
          );
        return (
          <ToolLine tool="setTodoDone">
            {parameters.done === false
              ? `Reopened “${title}”`
              : `Marked “${title}” done`}
          </ToolLine>
        );
      },
    },
    [],
  );
  return null;
}
