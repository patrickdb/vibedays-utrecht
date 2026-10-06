import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LissieChat } from "@/components/lissie-chat";
import { SignOutButton } from "@/components/sign-out-button";
import { TodoSidebar } from "@/components/todo-sidebar";
import { AppShell } from "@/components/ui/app-shell";
import { db } from "@/lib/db";
import { threadIdFor } from "@/lib/lissie";
import { user } from "@/lib/schema";
import { getUserId } from "@/lib/session";
import { listTodos } from "@/lib/todo-service";

export default async function Home() {
  const userId = await getUserId(await headers());
  if (!userId) redirect("/login");

  const [me] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId));

  const todos = await listTodos(userId);

  return (
    <AppShell
      title="Lissie"
      actions={
        <>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {me?.name ?? "friend"}
          </span>
          <SignOutButton />
        </>
      }
    >
      <LissieChat
        threadId={threadIdFor(userId)}
        sidebar={<TodoSidebar todos={todos} />}
      />
    </AppShell>
  );
}
