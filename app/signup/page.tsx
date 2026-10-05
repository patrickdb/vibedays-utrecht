import { AuthForm } from "@/components/auth-form";
import { AuthCard, FormFooter, TextLink } from "@/components/ui/form";

export default function SignUpPage() {
  return (
    <AuthCard title="Create your account">
      <AuthForm mode="signup" />
      <FormFooter>
        Already have an account? <TextLink href="/login">Log in</TextLink>
      </FormFooter>
    </AuthCard>
  );
}
