import "server-only";
import {
  type BaseEvent,
  EventType,
  type Message,
  type ToolCall,
} from "@ag-ui/client";
import {
  type AgentRunnerConnectRequest,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import type { MastraDBMessage } from "@mastra/core/memory";
import { concatMap, from, isEmpty, type Observable, switchMap } from "rxjs";
import { LISSIE_AGENT_ID, mastra, userIdOfThread } from "@/lib/lissie";

// The default runner keeps chat history in process memory, so a restart shows
// an empty chat even though Mastra memory (SQLite) still holds the whole
// conversation. This runner answers `connect` for a thread it has no live
// history for by replaying that conversation from Mastra memory.
//
// It trusts the thread id: lib/copilotkit.ts only lets a user connect to
// their own thread, and the owner is read back out of the id.
export class LissieRunner extends InMemoryAgentRunner {
  override connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    const live = super.connect(request);
    return live.pipe(
      isEmpty(),
      switchMap((nothingLive) =>
        nothingLive
          ? from(replayFromMemory(request.threadId)).pipe(concatMap((e) => e))
          : live,
      ),
    );
  }
}

async function replayFromMemory(threadId: string): Promise<BaseEvent[]> {
  const messages = await loadMessages(threadId);
  if (messages.length === 0) return [];
  const runId = `history-${threadId}`;
  return [
    { type: EventType.RUN_STARTED, threadId, runId },
    { type: EventType.MESSAGES_SNAPSHOT, messages },
    { type: EventType.RUN_FINISHED, threadId, runId },
  ] as BaseEvent[];
}

async function loadMessages(threadId: string): Promise<Message[]> {
  const resourceId = userIdOfThread(threadId);
  if (!resourceId) return [];
  const memory = await mastra.getAgent(LISSIE_AGENT_ID).getMemory();
  if (!memory) return [];
  // A thread that was never written has no history yet; recall throws for it.
  const thread = await memory.getThreadById({ threadId });
  if (thread?.resourceId !== resourceId) return [];
  const { messages } = await memory.recall({
    threadId,
    resourceId,
    perPage: false,
  });
  return messages.flatMap(toAgUiMessages);
}

// One Mastra message holds the whole turn: text and tool invocations in step
// order. AG-UI wants an assistant message with its tool calls, then one tool
// message per result, then whatever the assistant said next. A call without a
// result (the run died mid-tool) is left out: the chat could not render it.
export function toAgUiMessages(message: MastraDBMessage): Message[] {
  if (message.role === "user") {
    const text = message.content.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");
    return text ? [{ id: message.id, role: "user", content: text }] : [];
  }
  if (message.role !== "assistant") return [];

  const out: Message[] = [];
  let text = "";
  let calls: ToolCall[] = [];
  let results: Message[] = [];
  let segments = 0;
  const flush = () => {
    if (text || calls.length > 0) {
      out.push({
        id: segments === 0 ? message.id : `${message.id}-${segments}`,
        role: "assistant",
        content: text,
        ...(calls.length > 0 ? { toolCalls: calls } : {}),
      });
      out.push(...results);
      segments += 1;
    }
    text = "";
    calls = [];
    results = [];
  };

  for (const part of message.content.parts) {
    if (part.type === "text") {
      // Text after a tool result starts the assistant's next message.
      if (calls.length > 0) flush();
      text += part.text;
    } else if (
      part.type === "tool-invocation" &&
      part.toolInvocation.state === "result"
    ) {
      const { toolCallId, toolName, args, result } = part.toolInvocation;
      calls.push({
        id: toolCallId,
        type: "function",
        function: { name: toolName, arguments: JSON.stringify(args ?? {}) },
      });
      results.push({
        id: `${toolCallId}-result`,
        role: "tool",
        toolCallId,
        content: JSON.stringify(result ?? null),
      });
    }
  }
  flush();
  return out;
}
