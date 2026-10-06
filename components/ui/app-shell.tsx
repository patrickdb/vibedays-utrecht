import type { ReactNode } from "react";

// Signed-in page frame: a header with the page title and its actions, and a
// body that fills the rest of the viewport.
export function AppShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {title}
        </h1>
        <div className="flex items-center gap-3">{actions}</div>
      </header>
      <main className="mx-auto min-h-0 w-full max-w-3xl flex-1">
        {children}
      </main>
    </div>
  );
}
