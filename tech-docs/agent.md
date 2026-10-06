# Lissie, the agent

Lissie is one Mastra agent, served to the browser over AG-UI by the CopilotKit runtime. The chat lives on `/`, next to a read-only sidebar of the user's todos. She reads and changes the list through three tools; the system prompt makes her decline everything except the to-do list, in character, and comment on every todo she adds or marks done.

```
 / (CopilotChat) ──▶ /api/copilotkit/[[...slug]] ──▶ CopilotKit runtime ──▶ @ag-ui/mastra ──▶ Mastra agent ──▶ OpenRouter
                          authorization hooks             LissieRunner                           memory in SQLite
```

## Pieces

- `lib/lissie.ts`: the Mastra instance (agent, `Memory`, `LibSQLStore`), the thread-id helpers. The agent is registered under the record key `lissie`; **that key, not the agent's `id`, is the name the browser asks for**.
- `lib/copilotkit.ts`: the runtime and its fetch handler; `app/api/copilotkit/[[...slug]]/route.ts` only re-exports it for the four verbs the runtime needs.
- `lib/lissie-tools.ts`: `listTodos`, `addTodo`, `setTodoDone` (see Tools).
- `lib/lissie-progress.ts`, `lib/progress-card.ts`, `components/a2ui/`: the progress card (see A2UI card).
- `lib/lissie-runner.ts`: replays history on reconnect (see Memory).
- `components/lissie-chat.tsx`: the client chat, the tool-call lines and the sidebar refresh; `components/todo-sidebar.tsx` is the sidebar itself.
- The provider is mounted in `components/lissie-chat.tsx`, not in the layout, so the login pages never talk to the runtime. The CopilotKit stylesheet is imported in `app/layout.tsx`. The dev Inspector is off (`enableInspector={false}`): its overlay swallows clicks in dev.
- Versions are pinned exactly (`@mastra/*`, `@ag-ui/*`, `@copilotkit/*`); they move together.
- `@mastra/*` is in `serverExternalPackages` in `next.config.ts`.

## Model

- `openrouter/<OPENROUTER_MODEL>` through Mastra's model router, default `z-ai/glm-5.3-flash`. Check a model id with `node .claude/skills/mastra/scripts/provider-registry.mjs --provider openrouter`.
- `OPENROUTER_API_KEY` is read by the router on the server; nothing sends it to the browser.

## Memory

- Mastra memory lives in the app's SQLite file (`DATABASE_URL`, the same libsql file as Drizzle and Better Auth; Mastra owns its `mastra_*` tables and creates them itself, so they are not in `drizzle/`).
- **One thread per user, with a deterministic id**: `lissie-<Better Auth user id>` (`threadIdFor`). The user id also is the Mastra `resourceId`, taken from the server-side session when the agent is built for the request (`MastraAgent.getLocalAgents` inside the runtime's `agents` factory). The page computes the thread id server-side and hands it to `CopilotChat`.
- The AG-UI bridge passes the client's `threadId` to Mastra, so the id in the request is the memory thread. That is why ownership is a string comparison and needs no table.
- The default `InMemoryAgentRunner` forgets chat history on restart while Mastra memory does not. `LissieRunner` extends it: when `connect` finds nothing live for a thread, it replays that user's Mastra thread as a `MESSAGES_SNAPSHOT` (`toAgUiMessages`: text, plus every tool call that has a result, as an assistant message with `toolCalls` followed by its `tool` message; a call without a result is dropped). That is why the tool lines are still there after a restart.

## Tools

- The tools are one more adapter on the todo service ([architecture.md](architecture.md)): they call `lib/todo-service.ts` and hold no rules. A todo of another user is `{ error: "todo-not-found" }` to the model, like the REST API's 404.
- **The user id reaches a tool only through Mastra's request context.** The runtime's `agents` factory in `lib/copilotkit.ts` reads the session, puts the id in a fresh `RequestContext` under `USER_ID_KEY` and hands it to `MastraAgent.getLocalAgents` next to the memory `resourceId`; a tool reads it with `userIdOf` and throws without one. No input schema has a user field, so the model cannot name one, and the client has no way to set a context key (the bridge only adds its own `ag-ui` key).
- The request context is built per request, never shared across users.
- Her instructions are a function so they can carry today's date, which she needs to turn "tomorrow" into a due date. They tell her to comment on every add and every done, in character; that is prompt-level and only the model e2e exercises it.
- A new tool needs a line renderer in `ToolCallLines` (`components/lissie-chat.tsx`), or the chat shows no line for it.

## A2UI card

- `showProgress` (`lib/lissie-progress.ts`) counts total, done and open from the todo service and returns `{ a2ui_operations }`: `createSurface`, `updateComponents`, `updateDataModel`. The runtime's A2UI middleware renders any tool result with that key; there is no second model call and no render tool.
- The component tree is authored once in `lib/progress-card.ts` and binds the numbers by path (`/done`, `/total`, `/open`); only the data model carries figures. `PROGRESS_CATALOG_ID` must equal the id of the browser catalog (`components/a2ui/catalog.tsx`: `ProgressBar` plus the basic components), or the renderer says "Catalog not found".
- **`a2ui: { injectA2UITool: false }` in `lib/copilotkit.ts` is load-bearing**: unset, the runtime turns the injected UI-generating tool on as soon as the browser registers a catalog.
- The catalog is registered on the provider (`a2ui={{ catalog }}` in `components/lissie-chat.tsx`). The renderer runs on zod 3 (it bundles its own copy), so catalog definitions import `zod/v3`; a prop that binds to the data model must be a literal-or-path union such as `DynamicNumberSchema`.
- `@a2ui/web_core` and `@ag-ui/a2ui-middleware` are dev dependencies for the test only, pinned to the versions CopilotKit uses.

## The sidebar

- `components/todo-sidebar.tsx` is a plain component rendered by `app/page.tsx` from `listTodos`. It is read-only: Lissie is the browser's only write path for now.
- It refreshes because `LissieChat` subscribes to the agent (`onToolCallResultEvent`, `onRunFinalized`) and calls `router.refresh()`, which re-renders the server page. No polling, no browser read route.

## Authorization

The runtime authorizes nothing by itself. Its in-memory thread store has no owners: `GET /threads` lists every thread of the process, `/threads/:id/messages|events|state` read any id, `POST /threads/clear` wipes all. `:threadId` is chosen by the client and is not a secret.

`lib/copilotkit.ts` therefore:

- `onRequest` (runs on every route, before routing) answers 401 unless `getUserId` finds a session cookie or bearer token. The `agents` factory repeats the check.
- `onBeforeHandler` is an **allowlist over the runtime's route names** (`RouteInfo` in `@copilotkit/runtime`): `info`; `agent/run` and `agent/connect` (thread id read from the body) and `agent/stop` (thread id in the path), each only for agent `lissie` and only for the caller's own thread (403 otherwise, also when the id is missing, malformed or invented). **Every other route is 404**, including each `threads/*`, `memories/*`, `transcribe`, `annotate`, `agent/suggest`, `trajectory/connect`, the inspector and debug routes. A route the runtime adds later is therefore closed until someone opens it on purpose.
- The handler runs in multi-route mode; single-route mode would funnel other routes through one URL and is not mounted.
- The CopilotKit docs' advice to keep an ownership table is for apps with many threads per user; with one deterministic thread per user it is not needed.

## Tests

- `tests/unit/copilotkit-auth.test.ts` calls the handler with real bearer tokens: 401 on every route without a session (every route in `RouteInfo`), 403 for a foreign, invented or missing thread on run/connect/stop, 404 for every unserved route whoever asks, and the history replay from Mastra memory. When the runtime gains a route, add it to `otherRoutes` there. It imports Mastra and CopilotKit, so the first run is slow.
- `tests/unit/lissie-progress.test.ts`: the card operations on a temp database (numbers match the rows, per user, tree holds no figures, accepted by the real A2UI message processor and catalog, runtime keeps tool injection off); `tests/unit/progress-bar.test.tsx` covers `ProgressBar`.
- `tests/unit/lissie-tools.test.ts`: the executors on a temp database with two users: isolation per tool, no tool runs without a user in the context, a user id smuggled into the input is ignored. The history test in `copilotkit-auth.test.ts` also covers tool-call replay.
- `tests/e2e/chat-ui.spec.ts` (in QA): the chat and the sidebar render for a signed-in user, `/info` lists only Lissie, signed out gets 401. No model call.
- `tests/e2e-chat/chat.spec.ts` (`npm run test:e2e:chat`, config `playwright.chat.config.ts`): sends a real message and reloads, and asks her to add "buy milk" (it must appear in the sidebar and as a tool line, also after a reload). It calls the model through OpenRouter, so it needs `OPENROUTER_API_KEY` in `.env` and is neither in `npm run qa` nor in CI. The default QA `.env` carries a dummy key.

## Gotchas

- `next dev` compiles `/` and the runtime route lazily and both are heavy; the Playwright config allows for it (long timeouts), so do not shorten them.
- `useSingleEndpoint` is left to auto-detection; the runtime is multi-route, so a pinned `true` would 404.
- A failing model call (bad key, no credit) surfaces to the chat as a `RUN_ERROR` event; the chat shows nothing for it.
- The chat shows the model's reasoning ("Thought for N seconds") above GLM replies; hiding it would be a UI change in `components/lissie-chat.tsx`.
- The chat only accepts a message once its `connect` call has finished; `tests/e2e-chat/chat.spec.ts` waits for it, and so must any new e2e.
