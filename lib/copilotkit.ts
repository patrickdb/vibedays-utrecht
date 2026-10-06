import "server-only";
import { MastraAgent } from "@ag-ui/mastra";
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { LISSIE_AGENT_ID, mastra, threadIdFor } from "@/lib/lissie";
import { LissieRunner } from "@/lib/lissie-runner";
import { getUserId } from "@/lib/session";

export const BASE_PATH = "/api/copilotkit";

// The runtime serves many routes and authorizes none of them by itself: its
// in-memory thread store has no owners, so threads/list shows every thread in
// the process and threads/clear wipes them. Authorization is therefore an
// allowlist over the runtime's route names (see `RouteInfo` in
// @copilotkit/runtime): a route is served only if the chat needs it, and
// every route that names a thread must name the caller's own.
const runtime = new CopilotRuntime({
  // Built per request, so every run carries the signed-in user as its Mastra
  // memory resource and one user's run never shares an agent instance.
  agents: async ({ request }) => {
    const userId = await getUserId(request.headers);
    if (!userId) throw unauthorized();
    return MastraAgent.getLocalAgents({ mastra, resourceId: userId });
  },
  runner: new LissieRunner(),
});

export const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: BASE_PATH,
  hooks: {
    // Runs before routing, on every route.
    onRequest: async ({ request }) => {
      if (!(await getUserId(request.headers))) throw unauthorized();
    },
    onBeforeHandler: async ({ request, route }) => {
      const userId = await getUserId(request.headers);
      if (!userId) throw unauthorized();
      const ownThread = threadIdFor(userId);

      switch (route.method) {
        case "info":
          return;
        case "agent/stop":
          if (route.agentId !== LISSIE_AGENT_ID) throw notFound();
          if (route.threadId !== ownThread) throw forbidden();
          return;
        case "agent/run":
        case "agent/connect": {
          if (route.agentId !== LISSIE_AGENT_ID) throw notFound();
          // The thread travels in the body; clone it, the handler reads it too.
          const body: unknown = await request
            .clone()
            .json()
            .catch(() => null);
          const threadId =
            typeof body === "object" && body !== null && "threadId" in body
              ? body.threadId
              : undefined;
          if (threadId !== ownThread) throw forbidden();
          return;
        }
        default:
          // threads/*, transcribe, memories/*, annotate, suggestions, inspector
          // and debug routes: not used by the chat, so not served.
          throw notFound();
      }
    },
  },
});

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden(): Response {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}
