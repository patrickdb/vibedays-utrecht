import { expect, test } from "@playwright/test";

// Everything here stays off the model: it needs no OpenRouter key.
test("the chat on / is Lissie's, behind the session", async ({ page }) => {
  const email = `chat-ui-${Date.now()}@example.com`;

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Pat");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/");

  // The header keeps the user's name and the sign-out button.
  await expect(
    page.getByRole("heading", { level: 1, name: "Lissie" }),
  ).toBeVisible();
  await expect(page.getByText("Pat", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // The chat found Lissie on the runtime and is ready for a message.
  await expect(
    page.getByPlaceholder("Tell Lissie what you need to do…"),
  ).toBeVisible();

  // The read-only sidebar lists the user's open and done todos (none yet).
  const list = page.getByRole("complementary", { name: "Your list" });
  await expect(list.getByRole("region", { name: "Open" })).toContainText(
    "Nothing open",
  );
  await expect(list.getByRole("region", { name: "Done" })).toContainText(
    "Nothing finished",
  );

  // The runtime answers the signed-in browser, and nobody else.
  const info = await page.request.get("/api/copilotkit/info");
  expect(info.status()).toBe(200);
  expect(Object.keys((await info.json()).agents)).toEqual(["lissie"]);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/copilotkit/info")).status()).toBe(401);
});
