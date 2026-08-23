import { expect, test } from "@playwright/test";

/**
 * Happy path required by Phase 3, section 28: Session (real better-auth
 * login, see ./global-setup.ts) → TSV Benediktbeuern → Fußball →
 * Mannschaftsliste → Mannschaft öffnen. The session is pre-established via
 * storageState so this test focuses on navigation, not the login form
 * itself (which has its own manual/UI coverage via the real login page).
 */
test("Vereinsmitglied navigiert von Verein über Abteilung zur Mannschaft", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TSV Benediktbeuern" })).toBeVisible();

  // Scoped to <main> — the top nav also has a "Fußball" link (Phase 9,
  // /fussball) since the seeded department is also named "Fußball".
  await page.locator("main").getByRole("link", { name: "Fußball" }).click();
  await expect(page.getByRole("heading", { name: "Fußball" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2" })).toBeVisible();

  await page.getByRole("link", { name: "E1" }).click();
  await expect(page.getByRole("heading", { name: "E1" })).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: "Fußball" })).toBeVisible();
});
