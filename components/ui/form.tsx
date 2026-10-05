import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-50";

const buttonClass =
  "inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-base font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200";

const linkClass = "font-medium text-zinc-950 underline dark:text-zinc-50";

export function AuthCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-950">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

export function Form(props: ComponentProps<"form">) {
  return <form className="flex flex-col gap-4" {...props} />;
}

export function Field({
  label,
  ...props
}: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
      {label}
      <input className={inputClass} {...props} />
    </label>
  );
}

export function Button(props: ComponentProps<"button">) {
  return <button type="submit" className={buttonClass} {...props} />;
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function FormFooter({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">{children}</p>
  );
}

export function TextLink(props: ComponentProps<typeof Link>) {
  return <Link className={linkClass} {...props} />;
}
