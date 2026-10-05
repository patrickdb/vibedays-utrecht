import { AuthForm } from "@/components/auth-form";
import { AuthCard, FormFooter, TextLink } from "@/components/ui/form";

export default function LoginPage() {
  return (
    <AuthCard title="Log in">
      <AuthForm mode="login" />
      <FormFooter>
        New here? <TextLink href="/signup">Create an account</TextLink>
      </FormFooter>
    </AuthCard>
  );
}
