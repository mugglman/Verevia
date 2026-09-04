import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Happy path required by Phase 11, section 43: Login DEV-Admin → Fußball →
 * Turniere → neues Turnier anlegen → interne E1-Mannschaft hinzufügen →
 * externe Mannschaft hinzufügen → Gruppe A anlegen → Teilnehmer zuweisen →
 * Spielstätte hinzufügen → manuell ein Turnierspiel anlegen → Turnierdetail
 * zeigt alles korrekt an. Keine automatische Spielplan-/Bracket-Erzeugung
 * (Tournament Core only — see docs/PHASE_11_TOURNAMENT_CORE_REPORT.md).
 * Plus COACH E1: Turnier lesen, aber keine administrativen Aktionen. Uses
 * the default (TENANT_ADMIN) storageState from playwright.config.ts, and
 * relies on the Phase 9/10 seed (active season 2026/2027, E1, demo venue
 * "Sportplatz Benediktbeuern") plus the Phase 11 seed extension (tournament
 * "Verevia Jugendcup 2026", used only by the read-only COACH sub-test).
 *
 * Several assertions below deliberately scope to a specific visible
 * element (a badge <span>, a name <span>, a list-item with a known
 * sibling button) rather than a bare `getByText` — the same fix already
 * applied in match-foundation.spec.ts (Phase 10) for the analogous problem:
 * a name/label used both as visible text AND as hidden <option> text
 * inside a <select> matches twice under a bare text locator.
 *
 * This spec chains six Server Action submissions on one page (create
 * tournament, add two participants, create a group, assign it, add a
 * venue, create a match). Verified against the real, VPS-tunneled
 * PostgreSQL 17 instance used for Phase 11 verification, one of these
 * steps occasionally left the DOM stale after submission — Next.js's
 * `[WebServer] Error: The destination stream closed early` (a pre-existing,
 * documented quirk, see playwright.config.ts's `fullyParallel` comment,
 * apparently more likely under real added DB latency). A direct DB check
 * confirmed the mutation itself always lands correctly — only the client's
 * streamed re-render occasionally doesn't arrive. `expectVisibleAfterSubmit`
 * below reloads once (a real user would refresh a stuck page too) before
 * re-checking, which always resolves it, since a plain page load performs a
 * full server render rather than a streamed diff.
 */
async function expectVisibleAfterSubmit(page: Page, locator: Locator) {
  try {
    await expect(locator).toBeVisible({ timeout: 4000 });
  } catch {
    await page.reload();
    await expect(locator).toBeVisible();
  }
}
test("TENANT_ADMIN legt ein Turnier an, Teilnehmer, Gruppe, Spielstätte und ein Turnierspiel", async ({ page }) => {
  // Six chained Server Action submissions plus the occasional recovery
  // reload from expectVisibleAfterSubmit (see comment above) push this
  // comfortably past Playwright's 30s default under real, VPS-tunneled DB
  // latency — none of it slow application logic, just cumulative round-trips.
  test.setTimeout(90_000);
  const tournamentName = `E2E Turnier ${Date.now()}`;
  const externalTeamName = `E2E Externes Team ${Date.now()}`;

  await page.goto("/fussball");
  await page.getByRole("link", { name: "Turniere" }).click();
  await expect(page.getByRole("heading", { name: /turniere – fußball/i })).toBeVisible();

  await page.getByRole("link", { name: "Turnier anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Turnier anlegen" })).toBeVisible();

  await page.getByLabel(/^name$/i).fill(tournamentName);
  await page.getByLabel("Beginn").fill("2026-11-14T09:00");
  await page.getByLabel(/^modus$/i).selectOption("GROUPS");
  await page.getByRole("button", { name: "Turnier anlegen" }).click();
  // Waits on createTournamentAction's client-side redirect, which can take
  // several seconds under measured SSH-tunnel latency — page.waitForURL
  // keeps waiting instead of a tight-timeout heading check (see PHASE_16
  // report, "Bestehende Altlasten").
  await page.waitForURL(/\/fussball\/turniere\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: tournamentName })).toBeVisible();
  // No status field on the create form → the API defaults to DRAFT. Scoped
  // to the status badge — "Entwurf" also appears as <option> text inside
  // the status <select> of the Übersicht edit form below it.
  await expect(page.locator("span.rounded-full", { hasText: "Entwurf" })).toBeVisible();

  // Interne Mannschaft (E1) hinzufügen.
  const internalForm = page.locator("form", { has: page.getByLabel(/verevia-mannschaft hinzufügen/i) });
  await internalForm.getByLabel(/verevia-mannschaft hinzufügen/i).selectOption({ label: "E1 (E-Jugend)" });
  await internalForm.getByRole("button", { name: "Hinzufügen" }).click();
  await expectVisibleAfterSubmit(page, page.locator("span.font-medium", { hasText: "E1" }).first());
  // exact: true — a bare substring match also hits the form label
  // "Verevia-Mannschaft hinzufügen" above.
  await expect(page.getByText("Verevia-Mannschaft", { exact: true })).toBeVisible();

  // Externe Mannschaft hinzufügen.
  const externalForm = page.locator("form", { has: page.getByLabel(/externe mannschaft hinzufügen/i) });
  await externalForm.getByLabel(/externe mannschaft hinzufügen/i).fill(externalTeamName);
  await externalForm.getByRole("button", { name: "Hinzufügen" }).click();
  await expectVisibleAfterSubmit(page, page.locator("span.font-medium", { hasText: externalTeamName }));
  await expect(page.getByText("Externe Mannschaft", { exact: true })).toBeVisible();

  // Gruppe A anlegen.
  await page.getByLabel(/name der neuen gruppe/i).fill("Gruppe A");
  await page.getByRole("button", { name: "Gruppe anlegen" }).click();
  await expectVisibleAfterSubmit(page, page.locator("span.font-medium", { hasText: "Gruppe A" }));

  // E1 der Gruppe A zuweisen.
  const assignForm = page.locator("form", { has: page.getByLabel(/gruppe für e1/i) });
  await assignForm.getByLabel(/gruppe für e1/i).selectOption({ label: "Gruppe A" });
  await assignForm.getByRole("button", { name: "Zuweisen" }).click();

  // Spielstätte hinzufügen.
  const venueForm = page.locator("form", { has: page.getByLabel(/spielstätte auswählen/i) });
  await venueForm.getByLabel(/spielstätte auswählen/i).selectOption({ label: "Sportplatz Benediktbeuern" });
  await venueForm.getByLabel(/bezeichnung der spielstätte im turnier/i).fill("Hauptplatz");
  await venueForm.getByRole("button", { name: "Zuordnen" }).click();
  const assignedVenueRow = page.locator("li", { has: page.getByRole("button", { name: "Entfernen" }) });
  await expectVisibleAfterSubmit(page, assignedVenueRow);
  await expect(assignedVenueRow).toContainText("Hauptplatz (Sportplatz Benediktbeuern)");

  // Manuell ein Turnierspiel anlegen (E1 gegen die externe Mannschaft). The
  // dropdown options show the team + age group ("E1 (E-Jugend)"); the
  // persisted/displayed match itself only shows the team name ("E1").
  await page.getByLabel(/heimmannschaft/i).selectOption({ label: "E1 (E-Jugend)" });
  await page.getByLabel(/auswärtsmannschaft/i).selectOption({ label: externalTeamName });
  await page.getByLabel("Datum und Uhrzeit").fill("2026-11-14T10:00");
  await page.getByLabel(/heim\/auswärts/i).selectOption("HOME");
  await page.getByLabel(/^gruppe$/i).selectOption({ label: "Gruppe A" });
  await page.getByLabel(/^spielstätte$/i).selectOption({ label: "Hauptplatz (Sportplatz Benediktbeuern)" });
  await page.getByRole("button", { name: "Spiel anlegen" }).click();

  // Turnierdetail zeigt das neue Spiel korrekt an — keine automatische
  // Spielplan-Erzeugung, dies ist die einzige manuell angelegte Partie.
  await expectVisibleAfterSubmit(page, page.getByText(new RegExp(`E1 – ${externalTeamName}`)));
});

test.describe("COACH E1", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("liest ein Turnier, aber keine administrativen Aktionen möglich", async ({ page }) => {
    await page.goto("/fussball/turniere");
    await expect(page.getByRole("heading", { name: /turniere – fußball/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Turnier anlegen" })).toHaveCount(0);

    await page.getByText("Verevia Jugendcup 2026").click();
    // Detail-page navigation, not a Server Action redirect — but the
    // target page itself waits on multiple tunneled API fetches before
    // rendering, so the same generous URL-based wait applies.
    await page.waitForURL(/\/fussball\/turniere\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Verevia Jugendcup 2026" })).toBeVisible({ timeout: 15_000 });

    // Read-only: no edit/create forms anywhere on the detail page.
    await expect(page.getByRole("button", { name: "Speichern" })).toHaveCount(0);
    await expect(page.getByLabel(/externe mannschaft hinzufügen/i)).toHaveCount(0);
    await expect(page.getByLabel(/name der neuen gruppe/i)).toHaveCount(0);
    await expect(page.getByLabel(/spielstätte auswählen/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Spiel anlegen" })).toHaveCount(0);
  });
});
