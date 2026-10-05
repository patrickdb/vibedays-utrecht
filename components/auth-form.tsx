"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, Field, Form, FormError } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";

// One form for both pages: sign-up additionally asks for a name.
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));

    setPending(true);
    setError(null);
    const { error } =
      mode === "signup"
        ? await authClient.signUp.email({
            name: String(data.get("name")),
            email,
            password,
          })
        : await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Something went wrong");
      setPending(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Form onSubmit={onSubmit}>
      {mode === "signup" && (
        <Field label="Name" name="name" autoComplete="name" required />
      )}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        minLength={8}
        required
      />
      <FormError message={error} />
      <Button disabled={pending}>
        {mode === "signup" ? "Sign up" : "Log in"}
      </Button>
    </Form>
  );
}
