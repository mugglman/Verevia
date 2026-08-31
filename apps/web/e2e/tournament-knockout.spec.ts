import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Happy path for Phase 13's knockout/final-round bracket generator: Login
 * TENANT_ADMIN → Fußball → Turniere → Turnier anlegen (Modus K.-o.-System)
 * → externe Teilnehmer anlegen → Spielstätte zuordnen → KO-Baum erstellen →
 * Setzliste befüllen → Vorschau berechnen → Halbfinale/Finale prüfen → KO-
 * Baum übernehmen → persistierte Spiele sichtbar. Plus COACH: liest ein
 * Turnier, aber keine Generator-/Commit-Administration (server-side
 * enforced, checked via direct navigation to the knockout route).
 *
 * Deliberately builds its OWN temporary tournament via the UI (same
 * pattern as tournament-schedule.spec.ts) rather than reusing the seeded
 * "Verevia Pokal 2026" demo tournament — that seed tournament exists for
 * manual/demo purposes and committing a bracket for it here would make
 * this test non-repeatable on a persistent DEV database (a tournament can
 * only have ONE schedule committed, see TournamentKnockoutService.commit's
 * "existing schedule" guard).
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

test("TENANT_ADMIN erstellt und übernimmt automatisch einen KO-Baum", async ({ page }) => {
  test.setTimeout(120_000);
  const tournamentName = `E2E KO-Baum Cup ${Date.now()}`;
  const teamNames = ["Team Nord", "Team Süd", "Team Ost", "Team West"].map((name) => `${name} ${Date.now()}`);

  await page.goto("/fussball");
  await page.getByRole("link", { name: "Turniere" }).click();
  await page.getByRole("link", { name: "Turnier anlegen" }).click();

  await page.getByLabel(/^name$/i).fill(tournamentName);
  await page.getByLabel("Beginn").fill("2026-12-12T09:00");
  await page.getByLabel(/^modus$/i).selectOption("KNOCKOUT");
  await page.getByRole("button", { name: "Turnier anlegen" }).click();
  // NOT expectVisibleAfterSubmit here: this waits on createTournamentAction's
  // client-side redirect, which can take several seconds under measured
  // SSH-tunnel latency. Reloading while that redirect is still in flight
  // discards it outright (see PHASE_16 report, "Bestehende Altlasten" —
  // root-caused and fixed in Phase 17). page.waitForURL keeps waiting
  // instead of interrupting it.
  await page.waitForURL(/\/fussball\/turniere\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: tournamentName })).toBeVisible();

  // Vier externe Teilnehmer hinzufügen (kein Gruppenzuordnung nötig —
  // reines K.-o.-Turnier, Modus B aus dem Phase-13-Auftrag).
  const externalForm = page.locator("form", { has: page.getByLabel(/externe mannschaft hinzufügen/i) });
  for (const teamName of teamNames) {
    await externalForm.getByLabel(/externe mannschaft hinzufügen/i).fill(teamName);
    await externalForm.getByRole("button", { name: "Hinzufügen" }).click();
    await expectVisibleAfterSubmit(page, page.locator("span.font-medium", { hasText: teamName }));
  }

  // Spielstätte hinzufügen.
  const venueForm = page.locator("form", { has: page.getByLabel(/spielstätte auswählen/i) });
  await venueForm.getByLabel(/spielstätte auswählen/i).selectOption({ label: "Sportplatz Benediktbeuern" });
  await venueForm.getByRole("button", { name: "Zuordnen" }).click();
  const assignedVenueRow = page.locator("li", { has: page.getByRole("button", { name: "Entfernen" }) });
  await expectVisibleAfterSubmit(page, assignedVenueRow);

  // KO-Baum erstellen.
  await page.getByRole("link", { name: "KO-Baum erstellen" }).click();
  await expectVisibleAfterSubmit(page, page.getByRole("heading", { name: new RegExp(`KO-Baum erstellen.*${tournamentName}`) }));

  // Setzliste befüllen: alle vier Teams in Reihenfolge direkt setzen.
  for (const teamName of teamNames) {
    await page.getByRole("button", { name: `+ ${teamName}` }).click();
  }
  await expect(page.getByText(/Setzung 4:/)).toBeVisible();

  // Einstellungen: Defaults übernehmen, Spielstätte ist bereits vorausgewählt.
  await page.getByRole("button", { name: "KO-Baum berechnen" }).click();

  await expect(page.getByText(/erfüllt alle eingestellten pausen/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Halbfinale" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Finale", exact: true })).toBeVisible();
  await expect(page.getByText(/Sieger Halbfinale 1 – Sieger Halbfinale 2/)).toBeVisible();

  // "3 Spiele" alone is ambiguous — the commit button's full label is
  // unique and confirms the same count.
  const commitButton = page.getByRole("button", { name: /ko-baum übernehmen \(3 spiele\)/i });
  await expect(commitButton).toBeVisible();
  await commitButton.click();

  // Commit redirects back to the tournament detail page — a real
  // navigation, not a partial client update, so no reload-retry needed.
  await expect(page).toHaveURL(/\/fussball\/turniere\/[^/]+$/, { timeout: 15_000 });
  await expectVisibleAfterSubmit(page, page.getByRole("heading", { name: tournamentName }));
  await expect(page.getByRole("link", { name: "KO-Baum erstellen" })).toHaveCount(0);
  await expect(page.getByText("Noch keine Spiele angelegt.")).toHaveCount(0);
  // Each seeded team's semifinal match shows its name as a plain
  // (non-option) span, same reasoning as tournament-schedule.spec.ts —
  // scoped to avoid matching the same name inside <option> elements of the
  // manual-match-creation form's home/away selects.
  await expect(page.locator("p.font-medium", { hasText: teamNames[0]! }).first()).toBeVisible();
});

test.describe("COACH E1", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("kann einen KO-Baum nicht generieren oder übernehmen (serverseitig erzwungen)", async ({ page }) => {
    await page.goto("/fussball/turniere");
    await page.getByText("Verevia Pokal 2026").click();
    await expect(page.getByRole("heading", { name: "Verevia Pokal 2026" })).toBeVisible();

    // Kein "KO-Baum erstellen"-Link für COACH sichtbar (kein canEdit).
    await expect(page.getByRole("link", { name: "KO-Baum erstellen" })).toHaveCount(0);

    // Direkter Navigationsversuch auf die Generator-Route — muss serverseitig
    // blockiert werden, nicht nur clientseitig ausgeblendet sein.
    await page.goto(`${page.url()}/ko-baum`);
    await expect(page.getByText(/keine berechtigung/i)).toBeVisible();
    await expect(page.getByText(/setzliste/i)).toHaveCount(0);
  });
});
