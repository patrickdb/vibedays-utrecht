import { AuthForm } from "@/components/auth-form";
import { AuthCard, FormFooter, TextLink } from "@/components/ui/form";
import { safeNextPath } from "@/lib/safe-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  return (
    <AuthCard title="Log in">
      <AuthForm mode="login" next={next} />
      <FormFooter>
        New here?{" "}
        <TextLink href={`/signup?next=${encodeURIComponent(next)}`}>
          Create an account
        </TextLink>
      </FormFooter>
    </AuthCard>
  );
}
