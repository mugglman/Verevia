import { expect, test } from "@playwright/test";

test("development environment start page is reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Verevia")).toBeVisible();
  await expect(page.getByText("System operational")).toBeVisible();
});
