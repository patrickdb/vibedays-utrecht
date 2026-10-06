# Lissie, the agent

Lissie is one Mastra agent, served to the browser over AG-UI by the CopilotKit runtime. The chat lives on `/`. She has no tools yet; the system prompt says so and makes her decline everything except the to-do list, in character.

```
 / (CopilotChat) ──▶ /api/copilotkit/[[...slug]] ──▶ CopilotKit runtime ──▶ @ag-ui/mastra ──▶ Mastra agent ──▶ OpenRouter
                          authorization hooks             LissieRunner                           memory in SQLite
```

## Pieces

- `lib/lissie.ts`: the Mastra instance (agent, `Memory`, `LibSQLStore`), the thread-id helpers. The agent is registered under the record key `lissie`; **that key, not the agent's `id`, is the name the browser asks for**.
- `lib/copilotkit.ts`: the runtime and its fetch handler; `app/api/copilotkit/[[...slug]]/route.ts` only re-exports it for the four verbs the runtime needs.
- `lib/lissie-runner.ts`: replays history on reconnect (see Memory).
- `components/lissie-chat.tsx`: the client chat. The provider is mounted here, not in the layout, so the login pages never talk to the runtime. The CopilotKit stylesheet is imported in `app/layout.tsx`. The dev Inspector is off (`enableInspector={false}`): its overlay swallows clicks in dev.
- Versions are pinned exactly (`@mastra/*`, `@ag-ui/*`, `@copilotkit/*`); they move together.
- `@mastra/*` is in `serverExternalPackages` in `next.config.ts`.

## Model

- `openrouter/<OPENROUTER_MODEL>` through Mastra's model router, default `z-ai/glm-5.3-flash`. Check a model id with `node .claude/skills/mastra/scripts/provider-registry.mjs --provider openrouter`.
- `OPENROUTER_API_KEY` is read by the router on the server; nothing sends it to the browser.

## Memory

- Mastra memory lives in the app's SQLite file (`DATABASE_URL`, the same libsql file as Drizzle and Better Auth; Mastra owns its `mastra_*` tables and creates them itself, so they are not in `drizzle/`).
- **One thread per user, with a deterministic id**: `lissie-<Better Auth user id>` (`threadIdFor`). The user id also is the Mastra `resourceId`, taken from the server-side session when the agent is built for the request (`MastraAgent.getLocalAgents` inside the runtime's `agents` factory). The page computes the thread id server-side and hands it to `CopilotChat`.
- The AG-UI bridge passes the client's `threadId` to Mastra, so the id in the request is the memory thread. That is why ownership is a string comparison and needs no table.
- The default `InMemoryAgentRunner` forgets chat history on restart while Mastra memory does not. `LissieRunner` extends it: when `connect` finds nothing live for a thread, it replays that user's Mastra thread as a `MESSAGES_SNAPSHOT` (text parts of user and assistant messages only; extend `loadMessages` when tools add message parts).

## Authorization

The runtime authorizes nothing by itself. Its in-memory thread store has no owners: `GET /threads` lists every thread of the process, `/threads/:id/messages|events|state` read any id, `POST /threads/clear` wipes all. `:threadId` is chosen by the client and is not a secret.

`lib/copilotkit.ts` therefore:

- `onRequest` (runs on every route, before routing) answers 401 unless `getUserId` finds a session cookie or bearer token. The `agents` factory repeats the check.
- `onBeforeHandler` is an **allowlist over the runtime's route names** (`RouteInfo` in `@copilotkit/runtime`): `info`; `agent/run` and `agent/connect` (thread id read from the body) and `agent/stop` (thread id in the path), each only for agent `lissie` and only for the caller's own thread (403 otherwise, also when the id is missing, malformed or invented). **Every other route is 404**, including each `threads/*`, `memories/*`, `transcribe`, `annotate`, `agent/suggest`, `trajectory/connect`, the inspector and debug routes. A route the runtime adds later is therefore closed until someone opens it on purpose.
- The handler runs in multi-route mode; single-route mode would funnel other routes through one URL and is not mounted.
- The CopilotKit docs' advice to keep an ownership table is for apps with many threads per user; with one deterministic thread per user it is not needed.

## Tests

- `tests/unit/copilotkit-auth.test.ts` calls the handler with real bearer tokens: 401 on every route without a session (every route in `RouteInfo`), 403 for a foreign, invented or missing thread on run/connect/stop, 404 for every unserved route whoever asks, and the history replay from Mastra memory. When the runtime gains a route, add it to `otherRoutes` there. It imports Mastra and CopilotKit, so the first run is slow.
- `tests/e2e/chat-ui.spec.ts` (in QA): the chat renders for a signed-in user, `/info` lists only Lissie, signed out gets 401. No model call.
- `tests/e2e-chat/chat.spec.ts` (`npm run test:e2e:chat`, config `playwright.chat.config.ts`): sends a real message and reloads. It calls the model through OpenRouter, so it needs `OPENROUTER_API_KEY` in `.env` and is neither in `npm run qa` nor in CI. The default QA `.env` carries a dummy key.

## Gotchas

- `next dev` compiles `/` and the runtime route lazily and both are heavy; the Playwright config allows for it (long timeouts), so do not shorten them.
- `useSingleEndpoint` is left to auto-detection; the runtime is multi-route, so a pinned `true` would 404.
- A failing model call (bad key, no credit) surfaces to the chat as a `RUN_ERROR` event; the chat shows nothing for it.
- The chat shows the model's reasoning ("Thought for N seconds") above GLM replies; hiding it would be a UI change in `components/lissie-chat.tsx`.
- The chat only accepts a message once its `connect` call has finished; `tests/e2e-chat/chat.spec.ts` waits for it, and so must any new e2e.
