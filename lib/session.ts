import "server-only";
import { auth } from "@/lib/auth";

// The only place that turns a request into a user. Handles the session cookie
// and `Authorization: Bearer <token>` alike; returns null when neither is valid.
export async function getUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}
