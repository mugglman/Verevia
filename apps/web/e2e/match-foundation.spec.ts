import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Happy path required by Phase 10, section 40: Login DEV-Admin → Fußball →
 * Spiele → neues E1-Spiel anlegen (Gegner, Datum/Uhrzeit, Spielstätte) →
 * speichern → Spiel erscheint korrekt → bearbeiten (Status/Ergebnis) →
 * Änderung sichtbar. Plus COACH E1: eigenes Spiel verwalten, aber keine
 * administrativen Spielstätten-Aktionen. Uses the default (TENANT_ADMIN)
 * storageState from playwright.config.ts, relies on the Phase 9/10 seed
 * having run (active season 2026/2027, E1/E2, demo venue "Sportplatz
 * Benediktbeuern").
 */
test("TENANT_ADMIN legt ein neues Spiel an und bearbeitet es", async ({ page }) => {
  const opponentName = `E2E Gegner ${Date.now()}`;

  await page.goto("/fussball");
  await page.getByRole("link", { name: "Spiele" }).click();
  await expect(page.getByRole("heading", { name: /spiele – fußball/i })).toBeVisible();

  await page.getByRole("link", { name: "Spiel anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Spiel anlegen" })).toBeVisible();

  await page.getByLabel("Mannschaft").selectOption({ label: "E1 (E-Jugend)" });
  await page.getByLabel(/^Gegner$/).fill(opponentName);
  await page.getByLabel("Datum und Uhrzeit").fill("2026-10-10T10:00");
  await page.getByLabel(/heim\/auswärts/i).selectOption("HOME");
  await page.getByLabel("Spielstätte").selectOption({ label: "Sportplatz Benediktbeuern" });
  await page.getByLabel("Spieltyp").selectOption("FRIENDLY");
  await page.getByRole("button", { name: "Spiel anlegen" }).click();

  await expect(page.getByText(opponentName)).toBeVisible();
  await expect(page.getByText(/heimspiel/i).first()).toBeVisible();

  await page.getByText(opponentName).click();
  await expect(page.getByRole("heading", { name: new RegExp(opponentName) })).toBeVisible();

  await page.getByLabel("Status").selectOption("COMPLETED");
  await page.getByLabel("Tore Heim").fill("2");
  await page.getByLabel("Tore Auswärts").fill("1");
  await page.getByRole("button", { name: "Speichern" }).click();

  // Scoped to the status badge — "Abgeschlossen" also appears as <option>
  // text inside the status <select> of the edit form.
  await expect(page.locator("span.rounded-full", { hasText: "Abgeschlossen" })).toBeVisible();
});

test.describe("COACH E1", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("verwaltet eigene Spiele, aber keine Spielstätten-Verwaltung", async ({ page }) => {
    const opponentName = `E2E Coach Gegner ${Date.now()}`;

    await page.goto("/fussball/spiele");
    // COACH E1 only sees E1's matches — the seeded E2 match ("FC
    // Musterdorf") must not be visible here.
    await expect(page.getByText(/^E1 –/).first()).toBeVisible();
    await expect(page.getByText("FC Musterdorf")).toHaveCount(0);

    await page.getByRole("link", { name: "Spiel anlegen" }).click();
    await page.getByLabel(/^Gegner$/).fill(opponentName);
    await page.getByLabel("Datum und Uhrzeit").fill("2026-10-11T10:00");
    await page.getByLabel(/heim\/auswärts/i).selectOption("AWAY");
    await page.getByLabel("Spieltyp").selectOption("FRIENDLY");
    await page.getByRole("button", { name: "Spiel anlegen" }).click();
    await expect(page.getByText(opponentName)).toBeVisible();

    // No administrative venue actions for COACH.
    await page.goto("/spielstaetten");
    await expect(page.getByText(/sportplatz benediktbeuern/i)).toBeVisible();
    await expect(page.getByLabel("Name der Spielstätte")).toHaveCount(0);
    await expect(page.getByLabel(/name der neuen spielstätte/i)).toHaveCount(0);
  });
});
