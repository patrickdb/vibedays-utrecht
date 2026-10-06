import "server-only";
import { type BaseEvent, EventType, type Message } from "@ag-ui/client";
import {
  type AgentRunnerConnectRequest,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
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
  const history: Message[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = message.content.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");
    if (text)
      history.push({ id: message.id, role: message.role, content: text });
  }
  return history;
}
