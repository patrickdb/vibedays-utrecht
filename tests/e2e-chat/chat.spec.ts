import { expect, test } from "@playwright/test";

test("Lissie answers and the conversation survives a reload", async ({
  page,
}) => {
  const email = `chat-${Date.now()}@example.com`;
  const message = "My dentist appointment is on the 14th. Remember that.";

  // The chat connects to its thread once the page has loaded; sending earlier
  // loses the message.
  const connected = page.waitForResponse((r) =>
    r.url().endsWith("/api/copilotkit/agent/lissie/connect"),
  );
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Pat");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/");
  await connected;

  const run = page.waitForResponse((r) =>
    r.url().endsWith("/api/copilotkit/agent/lissie/run"),
  );
  const input = page.getByPlaceholder("Tell Lissie what you need to do…");
  await input.fill(message);
  await input.press("Enter");

  // Lissie answers: the run streams text and ends without an error.
  const stream = await (await run).text();
  expect(stream).toContain("TEXT_MESSAGE_CONTENT");
  expect(stream).not.toContain("RUN_ERROR");
  await expect(page.getByText(message)).toBeVisible();

  // A reload brings the conversation back from Mastra memory.
  await page.reload();
  await expect(page.getByText(message)).toBeVisible();
});
