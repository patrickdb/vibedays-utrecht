import { expect, test } from "@playwright/test";

test("a signed-out user signs up, then approves a CLI device code", async ({
  page,
  request,
}) => {
  const clientId = "todo-cat-cli";
  const codeResponse = await request.post("/api/auth/device/code", {
    data: { client_id: clientId },
  });
  const { device_code: deviceCode, user_code: userCode } =
    await codeResponse.json();

  // The device page needs a session; sign-up sends the user back to it.
  await page.goto(`/device?user_code=${userCode}`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Lissie");
  await page
    .getByLabel("Email")
    .fill(`lissie-device-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL(`/device?user_code=${userCode}`);
  await expect(page.getByLabel("Code from your terminal")).toHaveValue(
    userCode,
  );
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved.")).toBeVisible();

  // What `todo-cat login` polls for.
  const tokenResponse = await request.post("/api/auth/device/token", {
    data: {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: clientId,
    },
  });
  expect(tokenResponse.ok()).toBe(true);
  expect((await tokenResponse.json()).access_token).toBeTruthy();
});
