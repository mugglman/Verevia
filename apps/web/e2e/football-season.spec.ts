import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Happy path required by Phase 9, section 20: Login DEV-Admin → TSV
 * Benediktbeuern → Fußball → Saison 2026/27 → E1 → Altersklasse E-Jugend,
 * plus a TENANT_ADMIN season-management flow and a COACH read-only flow.
 * Uses the default (TENANT_ADMIN) storageState from playwright.config.ts,
 * relies on the Phase 9 seed extension (packages/database/prisma/seed.ts)
 * having run: department "Fußball" (sportType FOOTBALL), ACTIVE season
 * "2026/2027", age group "E-Jugend", team seasons for E1/E2.
 */
test("TENANT_ADMIN sieht die aktive Saison und Mannschaften mit Altersklasse", async ({ page }) => {
  await page.goto("/");
  // Scoped to <nav> — the department list on the home page also has a
  // "Fußball" link (the seeded department itself is named "Fußball").
  await page.locator("nav").getByRole("link", { name: "Fußball" }).click();

  await expect(page.getByRole("heading", { name: "Fußball" })).toBeVisible();
  await expect(page.getByText("2026/2027")).toBeVisible();
  await expect(page.getByText("E1")).toBeVisible();
  await expect(page.getByText("E2")).toBeVisible();
  await expect(page.getByText("E-Jugend").first()).toBeVisible();

  await page.getByRole("link", { name: "Saisons verwalten" }).click();
  await expect(page.getByRole("heading", { name: /saisons – fußball/i })).toBeVisible();
  await expect(page.getByText("2026/2027")).toBeVisible();
  // Scoped to the status badge — "Aktiv" also appears as an <option> text
  // inside the (hidden until opened) status <select> of the edit form.
  await expect(page.locator("span.rounded-full", { hasText: "Aktiv" })).toBeVisible();
});

test("TENANT_ADMIN legt eine neue Saison an und bearbeitet sie", async ({ page }) => {
  // Unique per run (no DELETE endpoint exists to clean this up afterwards,
  // and Season has no "E2E"-prefix fixture-cleanup convention like Person
  // — see e2e/global-setup.ts) so repeated runs never collide on name.
  const seasonName = `E2E Saison ${Date.now()}`;

  await page.goto("/fussball/saisons");

  await page.getByLabel(/name der neuen saison/i).fill(seasonName);
  await page.getByLabel(/beginn der neuen saison/i).fill("2027-08-01");
  await page.getByLabel(/ende der neuen saison/i).fill("2028-06-30");
  await page.getByRole("button", { name: "Saison anlegen" }).click();

  await expect(page.getByText(seasonName, { exact: true })).toBeVisible();
  // Scoped to the status badge — "Geplant" also appears as <option> text
  // inside multiple status <select> elements on this page.
  await expect(page.locator("span.rounded-full", { hasText: "Geplant" }).first()).toBeVisible();

  const newSeasonInput = page.locator(`input[aria-label="Saisonname"][value="${seasonName}"]`);
  const editedName = `${seasonName} (bearbeitet)`;
  await newSeasonInput.fill(editedName);
  await newSeasonInput.locator("xpath=ancestor::form").getByRole("button", { name: "Speichern" }).click();

  await expect(page.getByText(editedName, { exact: true })).toBeVisible();
});

test.describe("COACH E1", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("sieht die aktive Saison und E1 mit Altersklasse, aber keine Saisonverwaltung", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByRole("link", { name: "Fußball" }).click();

    await expect(page.getByRole("heading", { name: "Fußball" })).toBeVisible();
    await expect(page.getByText("2026/2027")).toBeVisible();
    await expect(page.getByText("E1")).toBeVisible();
    await expect(page.getByText("E-Jugend").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Saisons verwalten" })).toHaveCount(0);

    await page.goto("/fussball/saisons");
    await expect(page.getByText("2026/2027")).toBeVisible();
    await expect(page.getByLabel("Saisonname")).toHaveCount(0);
    await expect(page.getByLabel(/name der neuen saison/i)).toHaveCount(0);
  });
});
