"use client";

import { CopilotChat, CopilotKitProvider } from "@copilotkit/react-core/v2";

// `agentId` is the key Lissie is registered under in lib/lissie.ts; `threadId`
// is her one thread for this user (the server refuses any other).
export function LissieChat({ threadId }: { threadId: string }) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      agentId="lissie"
      enableInspector={false}
    >
      <CopilotChat
        agentId="lissie"
        threadId={threadId}
        className="h-full"
        labels={{
          welcomeMessageText: "Oh. You're here. Tell me what's on your list.",
          chatInputPlaceholder: "Tell Lissie what you need to do…",
        }}
      />
    </CopilotKitProvider>
  );
}
