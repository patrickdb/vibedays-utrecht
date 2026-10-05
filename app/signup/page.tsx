import { AuthForm } from "@/components/auth-form";
import { AuthCard, FormFooter, TextLink } from "@/components/ui/form";
import { safeNextPath } from "@/lib/safe-redirect";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  return (
    <AuthCard title="Create your account">
      <AuthForm mode="signup" next={next} />
      <FormFooter>
        Already have an account?{" "}
        <TextLink href={`/login?next=${encodeURIComponent(next)}`}>
          Log in
        </TextLink>
      </FormFooter>
    </AuthCard>
  );
}
