import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Happy path required by Phase 4, section 24: Admin-Testsession → Verein →
 * Fußball → E1 → Person hinzufügen → Person erscheint in Mitgliederliste.
 * Uses the default (TENANT_ADMIN) storageState from playwright.config.ts.
 */
test("TENANT_ADMIN fügt eine Person zur Mannschaft E1 hinzu", async ({ page }) => {
  const candidate = JSON.parse(
    await readFile(path.join(__dirname, ".auth", "candidate-person.json"), "utf-8"),
  ) as { fullName: string };

  await page.goto("/");
  await page.getByRole("link", { name: "Fußball" }).click();
  await page.getByRole("link", { name: "E1" }).click();
  await expect(page.getByRole("heading", { name: "E1" })).toBeVisible();

  await page.getByLabel("Person hinzufügen").selectOption({ label: candidate.fullName });
  await page.getByRole("button", { name: "Person hinzufügen" }).click();

  await expect(page.getByText(candidate.fullName)).toBeVisible();
});

/**
 * Additional Phase-4 requirement: COACH E1 sees E1's members but has no
 * access to the administrative Personenverwaltung. Uses a dedicated
 * storageState (a different, non-admin session) — see e2e/global-setup.ts.
 */
test.describe("COACH E1", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("sieht Mitglieder von E1, aber keine Personenverwaltung", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Fußball" }).click();
    await page.getByRole("link", { name: "E1" }).click();
    await expect(page.getByRole("heading", { name: "E1" })).toBeVisible();
    await expect(page.getByText("Max Mustermann")).toBeVisible();
    await expect(page.getByLabel("Person hinzufügen")).toHaveCount(0);

    await page.goto("/personen");
    await expect(page.getByText(/keine berechtigung/i)).toBeVisible();
    await expect(page.getByLabel(/vorname der neuen person/i)).toHaveCount(0);
  });
});
