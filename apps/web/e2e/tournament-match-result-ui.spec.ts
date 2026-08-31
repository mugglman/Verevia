import { expect, type Locator, type Page, test } from "@playwright/test";

/** Same reload-retry helper as the other tournament E2E specs — mitigates known SSH-tunnel-latency flakiness on post-submit navigations. */
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

/**
 * Phase 15 happy path: unlike tournament-match-slot-resolution.spec.ts
 * (Phase 14, which had to bootstrap a result via a direct API call because
 * no result-entry UI existed yet), this test drives the ENTIRE flow
 * through the real browser, exactly as a TENANT_ADMIN would: build a KO
 * bracket (with "Spiel um Platz 3" enabled) → enter both semifinal results
 * via the new inline result form → verify the winners appear in the Final
 * and the losers in the third-place match → verify a propagated match can
 * no longer be edited.
 */
test("TENANT_ADMIN trägt Halbfinal-Ergebnisse über die neue UI ein, Finale und Spiel um Platz 3 aktualisieren sich automatisch", async ({ page }) => {
  test.setTimeout(120_000);
  const tournamentName = `E2E Result UI Cup ${Date.now()}`;
  const teamNames = ["Team Nord", "Team Süd", "Team Ost", "Team West"].map((name) => `${name} ${Date.now()}`);

  await page.goto("/fussball");
  await page.getByRole("link", { name: "Turniere" }).click();
  await page.getByRole("link", { name: "Turnier anlegen" }).click();

  await page.getByLabel(/^name$/i).fill(tournamentName);
  await page.getByLabel("Beginn").fill("2026-12-12T09:00");
  await page.getByLabel(/^modus$/i).selectOption("KNOCKOUT");
  await page.getByRole("button", { name: "Turnier anlegen" }).click();
  await expectVisibleAfterSubmit(page, page.getByRole("heading", { name: tournamentName }));

  const externalForm = page.locator("form", { has: page.getByLabel(/externe mannschaft hinzufügen/i) });
  for (const teamName of teamNames) {
    await externalForm.getByLabel(/externe mannschaft hinzufügen/i).fill(teamName);
    await externalForm.getByRole("button", { name: "Hinzufügen" }).click();
    await expectVisibleAfterSubmit(page, page.locator("span.font-medium", { hasText: teamName }));
  }

  const venueForm = page.locator("form", { has: page.getByLabel(/spielstätte auswählen/i) });
  await venueForm.getByLabel(/spielstätte auswählen/i).selectOption({ label: "Sportplatz Benediktbeuern" });
  await venueForm.getByRole("button", { name: "Zuordnen" }).click();
  await expectVisibleAfterSubmit(page, page.locator("li", { has: page.getByRole("button", { name: "Entfernen" }) }));

  await page.getByRole("link", { name: "KO-Baum erstellen" }).click();
  await expectVisibleAfterSubmit(page, page.getByRole("heading", { name: new RegExp(`KO-Baum erstellen.*${tournamentName}`) }));
  for (const teamName of teamNames) {
    await page.getByRole("button", { name: `+ ${teamName}` }).click();
  }
  await page.getByRole("checkbox", { name: "Spiel um Platz 3 einplanen" }).check();
  await page.getByRole("button", { name: "KO-Baum berechnen" }).click();
  await expect(page.getByText(/erfüllt alle eingestellten pausen/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /ko-baum übernehmen \(4 spiele\)/i }).click();
  await expect(page).toHaveURL(/\/fussball\/turniere\/[^/]+$/, { timeout: 15_000 });

  // Standard seeding for 4 entrants (computeSeedOrder(4) = [1,4,2,3]):
  // SF-1 = seed1(Nord) v seed4(West), SF-2 = seed2(Süd) v seed3(Ost).
  // Each name is still unique to its own row before any result exists.
  const sf1Row = page.locator("li", { has: page.getByText(teamNames[0]!, { exact: true }) });
  await expectVisibleAfterSubmit(page, sf1Row.getByRole("button", { name: "Ergebnis eintragen" }));
  await sf1Row.getByRole("button", { name: "Ergebnis eintragen" }).click();
  await sf1Row.getByLabel(/tore heim/i).fill("2");
  await sf1Row.getByLabel(/tore auswärts/i).fill("1");
  await sf1Row.getByRole("button", { name: "Speichern" }).click();

  // Result saved, entry form gone, locked note shown (revalidatePath — no reload needed).
  await expectVisibleAfterSubmit(page, sf1Row.getByText(/2:1/));
  await expect(sf1Row.getByText(/bereits verwendet und kann nicht mehr geändert werden/i)).toBeVisible();
  await expect(sf1Row.getByRole("button", { name: /ergebnis/i })).toHaveCount(0);

  const sf2Row = page.locator("li", { has: page.getByText(teamNames[1]!, { exact: true }) });
  await sf2Row.getByRole("button", { name: "Ergebnis eintragen" }).click();
  await sf2Row.getByLabel(/tore heim/i).fill("0");
  await sf2Row.getByLabel(/tore auswärts/i).fill("2");
  await sf2Row.getByRole("button", { name: "Speichern" }).click();
  await expectVisibleAfterSubmit(page, sf2Row.getByText(/0:2/));

  // Each team name now appears in TWO rows (its own decided semifinal, plus
  // wherever it propagated to) — a single-name locator is ambiguous here.
  // Intersect two single-name filters to uniquely pin down a row that
  // contains BOTH names, since no two rows share the same pair.

  // Final: Nord (SF-1 winner) v Ost (SF-2 winner, away side of SF-2 won).
  const finalRow = page
    .locator("li")
    .filter({ has: page.getByText(teamNames[0]!, { exact: true }) })
    .filter({ has: page.getByText(teamNames[2]!, { exact: true }) });
  await expectVisibleAfterSubmit(page, finalRow);
  await expect(finalRow.getByRole("button", { name: "Ergebnis eintragen" })).toBeVisible();

  // Spiel um Platz 3: West (SF-1 loser) v Süd (SF-2 loser).
  const thirdPlaceRow = page
    .locator("li")
    .filter({ has: page.getByText(teamNames[3]!, { exact: true }) })
    .filter({ has: page.getByText(teamNames[1]!, { exact: true }) });
  await expect(thirdPlaceRow).toBeVisible();
  await expect(thirdPlaceRow.getByRole("button", { name: "Ergebnis eintragen" })).toBeVisible();
});
