import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Phase 18 happy path: Login DEV-Admin → Kalender → Termin anlegen (für
 * Mannschaft E1) → speichern → Termin erscheint korrekt → bearbeiten (Titel)
 * → Änderung sichtbar → löschen → Termin verschwindet. Plus COACH E1: sieht
 * nur E1s eigene Termine, nicht die einer anderen Mannschaft. Uses the
 * default (TENANT_ADMIN) storageState from playwright.config.ts, relies on
 * the Phase 9/10 seed having run (E1/E2, demo venue "Sportplatz
 * Benediktbeuern").
 *
 * Deliberately plain `expect(...).toBeVisible()` (Playwright's own
 * auto-retrying assertion, no reload) rather than a reload-retry helper for
 * every step that follows a Server Action redirect (createEventAction/
 * deleteEventAction) — same reasoning as match-foundation.spec.ts /
 * tournament-schedule.spec.ts: a reload can discard an in-flight
 * redirect under SSH-tunnel latency (see PHASE_16/17 reports), a plain
 * auto-retrying assertion cannot, since it never navigates.
 */
test("TENANT_ADMIN legt einen Termin an, bearbeitet und löscht ihn", async ({ page }) => {
  const title = `E2E Training ${Date.now()}`;

  await page.goto("/kalender");
  await expect(page.getByRole("heading", { name: "Kalender" })).toBeVisible();

  await page.getByRole("link", { name: "Termin anlegen" }).click();
  // /kalender/neu waits on GET /events/creatable-scopes + GET /venues in
  // parallel before it can render — slower than a typical single-fetch
  // page under SSH-tunnel latency, hence the longer explicit timeout.
  await expect(page.getByRole("heading", { name: "Termin anlegen" })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel(/für wen/i).selectOption({ label: "E1" });
  await page.getByLabel(/^titel$/i).fill(title);
  await page.getByLabel(/^art$/i).selectOption("TRAINING");
  await page.getByLabel("Beginn").fill("2026-10-15T17:00");
  await page.getByLabel("Ende").fill("2026-10-15T18:30");
  await page.getByLabel(/^ort$/i).selectOption({ label: "Sportplatz Benediktbeuern" });
  await page.getByRole("button", { name: "Termin anlegen" }).click();

  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/sportplatz benediktbeuern/i).first()).toBeVisible();

  await page.getByText(title).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });

  const updatedTitle = `${title} (bearbeitet)`;
  await page.getByLabel(/^titel$/i).fill(updatedTitle);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /termin löschen/i }).click();
  await expect(page.getByRole("heading", { name: "Kalender" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(updatedTitle)).toHaveCount(0);
});

test.describe("COACH E1", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("sieht nur eigene Mannschaftstermine, kann eigene Termine anlegen", async ({ page, browser }) => {
    // Bootstrap an E2-scoped event via the TENANT_ADMIN session so there is
    // something that must NOT be visible to COACH E1 — a genuinely separate
    // browser identity, not a mocked fixture.
    const adminContext = await browser.newContext({ storageState: path.join(__dirname, ".auth", "state.json") });
    const adminPage = await adminContext.newPage();
    const e2Title = `E2E E2-Termin ${Date.now()}`;
    await adminPage.goto("/kalender/neu");
    await adminPage.getByLabel(/für wen/i).selectOption({ label: "E2" });
    await adminPage.getByLabel(/^titel$/i).fill(e2Title);
    await adminPage.getByLabel("Beginn").fill("2026-10-16T17:00");
    await adminPage.getByLabel("Ende").fill("2026-10-16T18:00");
    await adminPage.getByRole("button", { name: "Termin anlegen" }).click();
    await expect(adminPage.getByText(e2Title)).toBeVisible({ timeout: 15_000 });
    await adminContext.close();

    const coachTitle = `E2E Coach Training ${Date.now()}`;
    await page.goto("/kalender");
    await expect(page.getByText(e2Title)).toHaveCount(0);

    await page.getByRole("link", { name: "Termin anlegen" }).click();
    await expect(page.getByRole("heading", { name: "Termin anlegen" })).toBeVisible({ timeout: 15_000 });
    // Only E1 is offered — COACH E1 has no create-eligible role for E2 or any department.
    await expect(page.getByLabel(/für wen/i).locator("option")).toHaveCount(1);
    await page.getByLabel(/^titel$/i).fill(coachTitle);
    await page.getByLabel("Beginn").fill("2026-10-17T17:00");
    await page.getByLabel("Ende").fill("2026-10-17T18:00");
    await page.getByRole("button", { name: "Termin anlegen" }).click();
    await expect(page.getByText(coachTitle)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(e2Title)).toHaveCount(0);
  });
});
