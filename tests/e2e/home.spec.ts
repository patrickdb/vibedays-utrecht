import { expect, test } from "@playwright/test";

test("home page sends a signed-out visitor to the login page", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
