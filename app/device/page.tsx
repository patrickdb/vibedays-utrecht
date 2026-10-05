import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DeviceApproval } from "@/components/device-approval";
import { AuthCard } from "@/components/ui/form";
import { getUserId } from "@/lib/session";

// Where `todo-cat login` sends the user: a signed-in user approves or denies
// the code shown in the terminal (Better Auth device authorization).
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string }>;
}) {
  const { user_code: userCode } = await searchParams;
  if (!(await getUserId(await headers()))) {
    const here = `/device${userCode ? `?user_code=${encodeURIComponent(userCode)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  return (
    <AuthCard title="Approve the CLI">
      <DeviceApproval initialCode={userCode ?? ""} />
    </AuthCard>
  );
}
