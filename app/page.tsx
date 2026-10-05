import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { AuthCard } from "@/components/ui/form";
import { db } from "@/lib/db";
import { user } from "@/lib/schema";
import { getUserId } from "@/lib/session";

export default async function Home() {
  const userId = await getUserId(await headers());
  if (!userId) redirect("/login");

  const [me] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId));

  return (
    <AuthCard title={`Hello, ${me?.name ?? "friend"}`}>
      <SignOutButton />
    </AuthCard>
  );
}
