import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import LoginPage from "@/app/login/page";
import SignUpPage from "@/app/signup/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// The home page itself is an async Server Component, which Vitest cannot
// render; tests/e2e/auth.spec.ts covers it. The login and sign-up pages are
// async only to read `searchParams`, so the test awaits them and renders the
// element they return.
const noParams = { searchParams: Promise.resolve({}) };

test("login page renders its heading and fields", async () => {
  render(await LoginPage(noParams));
  expect(
    screen.getByRole("heading", { level: 1, name: "Log in" }),
  ).toBeDefined();
  expect(screen.getByLabelText("Email")).toBeDefined();
  expect(screen.getByLabelText("Password")).toBeDefined();
});

test("sign-up page additionally asks for a name", async () => {
  render(await SignUpPage(noParams));
  expect(
    screen.getByRole("heading", { level: 1, name: "Create your account" }),
  ).toBeDefined();
  expect(screen.getByLabelText("Name")).toBeDefined();
});
