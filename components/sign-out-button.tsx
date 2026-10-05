"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button type="button" onClick={signOut}>
      Sign out
    </Button>
  );
}
