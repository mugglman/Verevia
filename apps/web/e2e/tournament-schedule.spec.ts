import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Happy path required by Phase 12, section 51: Login TENANT_ADMIN →
 * Fußball → Turniere → Turnier anlegen → Teilnehmer/Gruppe/Spielstätte
 * einrichten → Spielplan erstellen → Einstellungen setzen → Vorschau
 * berechnen → Spiele prüfen → Spielplan übernehmen → persistierte Spiele
 * sichtbar. Plus COACH: liest ein Turnier, aber keine Generator-/Commit-
 * Administration (server-side enforced, checked via direct navigation to
 * the schedule route).
 *
 * Deliberately builds its OWN temporary tournament via the UI (same
 * pattern as tournament-core.spec.ts) rather than reusing the seeded
 * "Verevia Frühjahrscup 2026" demo tournament — that seed tournament
 * exists for manual/demo purposes (section 52) and committing a schedule
 * for it here would make this test non-repeatable on a persistent DEV
 * database (a tournament can only have ONE schedule committed, see
 * TournamentScheduleService.commit's "existing schedule" guard).
 */
async function expectVisibleAfterSubmit(page: Page, locator: Locator, reloadAttempts = 3) {
  for (let attempt = 0; attempt <= reloadAttempts; attempt++) {
    try {
      await expect(locator).toBeVisible({ timeout: 4000 });
      return;
    } catch {
      if (attempt === reloadAttempts) throw new Error(`Element still not visible after ${reloadAttempts} reload attempts`);
      await page.reload();
    }
  }
}

test("TENANT_ADMIN erstellt und übernimmt automatisch einen Turnier-Spielplan", async ({ page }) => {
  test.setTimeout(120_000);
  const tournamentName = `E2E Spielplan Cup ${Date.now()}`;
  const teamNames = ["Team Rot", "Team Blau", "Team Grün", "Team Gelb"].map((name) => `${name} ${Date.now()}`);

  await page.goto("/fussball");
  await page.getByRole("link", { name: "Turniere" }).click();
  await page.getByRole("link", { name: "Turnier anlegen" }).click();

  await page.getByLabel(/^name$/i).fill(tournamentName);
  await page.getByLabel("Beginn").fill("2026-12-12T09:00");
  await page.getByLabel(/^modus$/i).selectOption("GROUPS");
  await page.getByRole("button", { name: "Turnier anlegen" }).click();
  await expect(page.getByRole("heading", { name: tournamentName })).toBeVisible();

  // Vier externe Teilnehmer hinzufügen.
  const externalForm = page.locator("form", { has: page.getByLabel(/externe mannschaft hinzufügen/i) });
  for (const teamName of teamNames) {
    await externalForm.getByLabel(/externe mannschaft hinzufügen/i).fill(teamName);
    await externalForm.getByRole("button", { name: "Hinzufügen" }).click();
    await expectVisibleAfterSubmit(page, page.locator("span.font-medium", { hasText: teamName }));
  }

  // Gruppe A anlegen und alle vier Teilnehmer zuweisen.
  await page.getByLabel(/name der neuen gruppe/i).fill("Gruppe A");
  await page.getByRole("button", { name: "Gruppe anlegen" }).click();
  await expectVisibleAfterSubmit(page, page.locator("span.font-medium", { hasText: "Gruppe A" }));

  for (const teamName of teamNames) {
    const assignForm = page.locator("form", { has: page.getByLabel(`Gruppe für ${teamName}`) });
    await assignForm.getByLabel(`Gruppe für ${teamName}`).selectOption({ label: "Gruppe A" });
    await assignForm.getByRole("button", { name: "Zuweisen" }).click();
  }

  // Spielstätte hinzufügen.
  const venueForm = page.locator("form", { has: page.getByLabel(/spielstätte auswählen/i) });
  await venueForm.getByLabel(/spielstätte auswählen/i).selectOption({ label: "Sportplatz Benediktbeuern" });
  await venueForm.getByRole("button", { name: "Zuordnen" }).click();
  const assignedVenueRow = page.locator("li", { has: page.getByRole("button", { name: "Entfernen" }) });
  await expectVisibleAfterSubmit(page, assignedVenueRow);

  // Spielplan erstellen.
  await page.getByRole("link", { name: "Spielplan erstellen" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Spielplan erstellen.*${tournamentName}`) })).toBeVisible();
  await expect(page.getByText(/voraussichtlich 6 spiele insgesamt/i)).toBeVisible();

  // Einstellungen: Defaults übernehmen, Spielstätte ist bereits vorausgewählt.
  await page.getByRole("button", { name: "Spielplan berechnen" }).click();

  await expect(page.getByText(/erfüllt alle eingestellten pausen/i)).toBeVisible({ timeout: 10_000 });

  // "6 Spiele" alone is ambiguous (the vorab-berechnung paragraph above
  // also contains that substring) — the commit button's full label is
  // unique and confirms the same count.
  const commitButton = page.getByRole("button", { name: /spielplan übernehmen \(6 spiele\)/i });
  await expect(commitButton).toBeVisible();
  await commitButton.click();

  // Commit redirects back to the tournament detail page — a real
  // navigation, not a partial client update, so no reload-retry needed.
  await expect(page).toHaveURL(/\/fussball\/turniere\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: tournamentName })).toBeVisible();
  await expect(page.getByRole("link", { name: "Spielplan erstellen" })).toHaveCount(0);
  await expect(page.getByText("Noch keine Spiele angelegt.")).toHaveCount(0);
  // Each generated match's row shows the team name as a plain (non-option)
  // span — scoped this way for the same reason as tournament-core.spec.ts:
  // a bare getByText would also match the same name inside <option>
  // elements of the manual-match-creation form's home/away selects.
  // `.first()`: round-robin gives every team 3 matches (n=4), so the same
  // team name legitimately appears in multiple match rows.
  await expect(page.locator("p.font-medium", { hasText: teamNames[0]! }).first()).toBeVisible();
});

test.describe("COACH E1", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("kann einen Spielplan nicht generieren oder übernehmen (serverseitig erzwungen)", async ({ page }) => {
    await page.goto("/fussball/turniere");
    await page.getByText("Verevia Frühjahrscup 2026").click();
    await expect(page.getByRole("heading", { name: "Verevia Frühjahrscup 2026" })).toBeVisible();

    // Kein "Spielplan erstellen"-Link für COACH sichtbar (kein canEdit).
    await expect(page.getByRole("link", { name: "Spielplan erstellen" })).toHaveCount(0);

    // Direkter Navigationsversuch auf die Generator-Route — muss serverseitig
    // blockiert werden, nicht nur clientseitig ausgeblendet sein.
    await page.goto(`${page.url()}/spielplan`);
    await expect(page.getByText(/keine berechtigung/i)).toBeVisible();
    await expect(page.getByLabel(/spieldauer/i)).toHaveCount(0);
  });
});
