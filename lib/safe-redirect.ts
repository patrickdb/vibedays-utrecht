// Only same-site paths: a `next` parameter must never send a user to another site.
export function safeNextPath(next: string | string[] | undefined): string {
  if (typeof next !== "string") return "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next
    : "/";
}
