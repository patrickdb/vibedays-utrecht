"use client";

import { type FormEvent, useState } from "react";
import { Button, Field, Form, FormError } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";

type Step =
  | { name: "enter" }
  | { name: "review"; code: string }
  | { name: "done"; message: string };

// Three steps: enter the code (prefilled from the link), review it (looking it
// up also binds it to this user), approve or deny.
export function DeviceApproval({ initialCode }: { initialCode: string }) {
  const [step, setStep] = useState<Step>({ name: "enter" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function lookUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code")).trim();
    setPending(true);
    setError(null);
    const { error } = await authClient.device({ query: { user_code: code } });
    setPending(false);
    if (error) {
      setError(error.error_description ?? "That code is not valid");
      return;
    }
    setStep({ name: "review", code });
  }

  async function decide(code: string, approve: boolean) {
    setPending(true);
    setError(null);
    const { error } = approve
      ? await authClient.device.approve({ userCode: code })
      : await authClient.device.deny({ userCode: code });
    setPending(false);
    if (error) {
      setError(error.error_description ?? "Something went wrong");
      return;
    }
    setStep({
      name: "done",
      message: approve
        ? "Approved. You can go back to your terminal."
        : "Denied. The CLI was not logged in.",
    });
  }

  if (step.name === "done") {
    return <p role="status">{step.message}</p>;
  }

  if (step.name === "review") {
    const { code } = step;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-zinc-700 dark:text-zinc-300">
          Log the todo-cat CLI in to your account? Only approve the code{" "}
          <strong data-testid="device-code">{code}</strong> if you just started
          it yourself.
        </p>
        <FormError message={error} />
        <Button
          type="button"
          disabled={pending}
          onClick={() => decide(code, true)}
        >
          Approve
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() => decide(code, false)}
        >
          Deny
        </Button>
      </div>
    );
  }

  return (
    <Form onSubmit={lookUp}>
      <Field
        label="Code from your terminal"
        name="code"
        defaultValue={initialCode}
        autoComplete="off"
        required
      />
      <FormError message={error} />
      <Button disabled={pending}>Continue</Button>
    </Form>
  );
}
