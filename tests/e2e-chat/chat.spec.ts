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

test("Lissie adds a todo: it shows in the sidebar and the chat", async ({
  page,
}) => {
  const email = `todo-${Date.now()}@example.com`;

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

  const list = page.getByRole("complementary", { name: "Your list" });
  await expect(list.getByRole("region", { name: "Open" })).toContainText(
    "Nothing open",
  );

  const run = page.waitForResponse((r) =>
    r.url().endsWith("/api/copilotkit/agent/lissie/run"),
  );
  const input = page.getByPlaceholder("Tell Lissie what you need to do…");
  await input.fill('Add "buy milk" to my list.');
  await input.press("Enter");

  // The sidebar refreshes by itself when Lissie changes the list.
  await expect(
    list.getByRole("region", { name: "Open" }).getByText("buy milk"),
  ).toBeVisible();
  // She comments after the tool ran: text follows the tool result.
  const stream = await (await run).text();
  expect(stream).not.toContain("RUN_ERROR");
  const afterTool = stream.slice(stream.indexOf("TOOL_CALL_RESULT"));
  expect(afterTool).toContain("TEXT_MESSAGE_CONTENT");
  // One readable line for the call, not JSON.
  await expect(page.locator('[data-tool-call="addTodo"]')).toContainText(
    "buy milk",
  );

  // The call is still there after a reload (history replayed from memory).
  await page.reload();
  await expect(page.locator('[data-tool-call="addTodo"]')).toContainText(
    "buy milk",
  );
  await expect(
    list.getByRole("region", { name: "Open" }).getByText("buy milk"),
  ).toBeVisible();
});
