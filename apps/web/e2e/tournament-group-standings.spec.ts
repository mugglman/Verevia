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
 * Phase 16 happy path — the ENTIRE flow driven through the real browser,
 * no API bootstrap needed anywhere: build a "Gruppen + K.-o." tournament
 * (one group of 3, one Final fed by that group's positions 1/2) → enter
 * all three group results via the Phase 15 result form → watch the group
 * table appear/update after each result (Zwischenstand → Endstand) → watch
 * the Final's two pending "Gruppe A, Platz N" placeholders resolve into
 * real team names automatically the moment the group completes → enter
 * the Final's result too.
 *
 * The Final is committed via the real KO generator BEFORE any group match
 * exists (`hasExistingSchedule`/`existingMatchCount` in the KO generator
 * both gate on "any match already exists" — see the API integration
 * test's createSingleGroupWithFinal doc comment for the full reasoning).
 * The group's own three matches are then added one at a time via the
 * tournament detail page's existing manual "Spiel anlegen" form (Phase 8),
 * which is NOT gated by that same guard — this mirrors how a
 * GROUPS_AND_KNOCKOUT tournament is actually meant to be built today.
 */
test("TENANT_ADMIN spielt eine Gruppe durch, die Tabelle aktualisiert sich live und löst automatisch die Finale-Slots auf", async ({ page }) => {
  test.setTimeout(180_000);
  const tournamentName = `E2E Group Standings Cup ${Date.now()}`;
  const teamNames = ["Team Gruppe Eins", "Team Gruppe Zwei", "Team Gruppe Drei"].map((name) => `${name} ${Date.now()}`);

  await page.goto("/fussball");
  await page.getByRole("link", { name: "Turniere" }).click();
  await page.getByRole("link", { name: "Turnier anlegen" }).click();

  await page.getByLabel(/^name$/i).fill(tournamentName);
  await page.getByLabel("Beginn").fill("2026-12-19T09:00");
  await page.getByLabel(/^modus$/i).selectOption({ label: "Gruppen + K.-o." });
  await page.getByRole("button", { name: "Turnier anlegen" }).click();
  // NOT expectVisibleAfterSubmit here: this step waits on a Server
  // Action's client-side redirect (createTournamentAction), which under
  // measured SSH-tunnel latency can take several seconds end to end. That
  // reload-retry helper is safe for waiting on a GET-rendered value to
  // update, but reloading WHILE this specific redirect is still in flight
  // discards it outright (a fresh document has nothing left to process
  // the pending navigation) — reproduced directly against this VPS (a
  // >4s round trip, then a genuine, permanent stall once reloaded away
  // from). page.waitForURL keeps waiting instead of interrupting it.
  await page.waitForURL(/\/fussball\/turniere\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: tournamentName })).toBeVisible();

  const externalForm = page.locator("form", { has: page.getByLabel(/externe mannschaft hinzufügen/i) });
  for (const teamName of teamNames) {
    await externalForm.getByLabel(/externe mannschaft hinzufügen/i).fill(teamName);
    await externalForm.getByRole("button", { name: "Hinzufügen" }).click();
    await expectVisibleAfterSubmit(page, page.locator("span.font-medium", { hasText: teamName }));
  }

  const groupForm = page.locator("form", { has: page.getByLabel("Name der neuen Gruppe") });
  await groupForm.getByLabel("Name der neuen Gruppe").fill("Gruppe A");
  await groupForm.getByRole("button", { name: "Gruppe anlegen" }).click();
  await expectVisibleAfterSubmit(page, page.locator("span.font-medium", { hasText: "Gruppe A" }));

  for (const teamName of teamNames) {
    const participantRow = page.locator("li", { has: page.getByText(teamName, { exact: true }) }).first();
    await participantRow.getByLabel(`Gruppe für ${teamName}`).selectOption({ label: "Gruppe A" });
    await participantRow.getByRole("button", { name: "Zuweisen" }).click();
  }
  // Each team now shows up inside the Gruppe A fallback list too — confirms the assignment stuck.
  const groupSection = page.locator("section", { has: page.getByRole("heading", { name: "Gruppen" }) });
  for (const teamName of teamNames) {
    await expectVisibleAfterSubmit(page, groupSection.getByText(teamName, { exact: true }));
  }

  const venueForm = page.locator("form", { has: page.getByLabel(/spielstätte auswählen/i) });
  await venueForm.getByLabel(/spielstätte auswählen/i).selectOption({ label: "Sportplatz Benediktbeuern" });
  await venueForm.getByRole("button", { name: "Zuordnen" }).click();
  await expectVisibleAfterSubmit(page, page.locator("li", { has: page.getByRole("button", { name: "Entfernen" }) }));

  // Commit the Final (GROUP_POSITION 1 v GROUP_POSITION 2 of Gruppe A) — zero matches exist yet, so the KO generator's "one schedule" guard doesn't block this.
  await page.getByRole("link", { name: "KO-Baum erstellen" }).click();
  await expectVisibleAfterSubmit(page, page.getByRole("heading", { name: new RegExp(`KO-Baum erstellen.*${tournamentName}`) }));
  await page.getByLabel("Gruppe", { exact: true }).selectOption({ label: "Gruppe A" });
  await page.getByLabel("Platz", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await page.getByLabel("Platz", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("Gruppe A, Platz 1")).toBeVisible();
  await expect(page.getByText("Gruppe A, Platz 2")).toBeVisible();
  await page.getByRole("button", { name: "KO-Baum berechnen" }).click();
  await expect(page.getByText(/erfüllt alle eingestellten pausen/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /ko-baum übernehmen \(1 spiele\)/i }).click();
  await expect(page).toHaveURL(/\/fussball\/turniere\/[^/]+$/, { timeout: 15_000 });

  const spieleSection = page.locator("section", { has: page.getByRole("heading", { name: "Spiele" }) });
  await expectVisibleAfterSubmit(page, spieleSection.getByText("Gruppe A, Platz 1"));
  await expect(spieleSection.getByText("Gruppe A, Platz 2")).toBeVisible();

  // Add the group's own three round-robin matches via the plain manual "Spiel anlegen" form (no auto-generator involved — see doc comment above).
  const pairs: Array<[string, string]> = [
    [teamNames[0]!, teamNames[1]!],
    [teamNames[0]!, teamNames[2]!],
    [teamNames[1]!, teamNames[2]!],
  ];
  const matchForm = page.locator("form", { has: page.getByRole("button", { name: "Spiel anlegen" }) });
  let hour = 10;
  for (const [home, away] of pairs) {
    await matchForm.getByLabel("Heimmannschaft").selectOption({ label: home });
    await matchForm.getByLabel("Auswärtsmannschaft").selectOption({ label: away });
    await matchForm.getByLabel("Datum und Uhrzeit").fill(`2026-12-19T${String(hour).padStart(2, "0")}:00`);
    hour += 1;
    await matchForm.getByLabel("Heim/Auswärts").selectOption({ label: "Neutraler Platz" });
    await matchForm.getByLabel("Gruppe", { exact: true }).selectOption({ label: "Gruppe A" });
    await matchForm.getByLabel("Spielstätte").selectOption({ label: "Sportplatz Benediktbeuern" });
    await matchForm.getByRole("button", { name: "Spiel anlegen" }).click();
    await expectVisibleAfterSubmit(page, spieleSection.locator("li").filter({ has: page.getByText(home, { exact: true }) }).filter({ has: page.getByText(away, { exact: true }) }));
  }

  // No result yet anywhere in the group: table stays the plain participant list (no Zwischenstand/Endstand badge).
  await expect(groupSection.getByText("Zwischenstand")).toHaveCount(0);
  await expect(groupSection.getByText("Endstand")).toHaveCount(0);

  function matchRow(home: string, away: string) {
    return spieleSection.locator("li").filter({ has: page.getByText(home, { exact: true }) }).filter({ has: page.getByText(away, { exact: true }) });
  }

  // Match 1: Team 1 beats Team 2, 2:0.
  const row1 = matchRow(teamNames[0]!, teamNames[1]!);
  await row1.getByRole("button", { name: "Ergebnis eintragen" }).click();
  await row1.getByLabel(/tore heim/i).fill("2");
  await row1.getByLabel(/tore auswärts/i).fill("0");
  await row1.getByRole("button", { name: "Speichern" }).click();
  await expectVisibleAfterSubmit(page, row1.getByText(/2:0/));

  // Interim standing now visible; group not yet complete (Team 3 hasn't played), Final still pending.
  await expectVisibleAfterSubmit(page, groupSection.getByText("Zwischenstand"));
  await expect(groupSection.getByText("Endstand")).toHaveCount(0);
  await expect(spieleSection.getByText("Gruppe A, Platz 1")).toBeVisible();
  await expect(spieleSection.getByText("Gruppe A, Platz 2")).toBeVisible();

  // Match 2: Team 1 beats Team 3, 3:0 — Team 1 now has 6 points, an unassailable group lead.
  const row2 = matchRow(teamNames[0]!, teamNames[2]!);
  await row2.getByRole("button", { name: "Ergebnis eintragen" }).click();
  await row2.getByLabel(/tore heim/i).fill("3");
  await row2.getByLabel(/tore auswärts/i).fill("0");
  await row2.getByRole("button", { name: "Speichern" }).click();
  await expectVisibleAfterSubmit(page, row2.getByText(/3:0/));

  // Still not complete (Team 2 v Team 3 outstanding) — Final still pending.
  await expect(groupSection.getByText("Endstand")).toHaveCount(0);
  await expect(spieleSection.getByText("Gruppe A, Platz 1")).toBeVisible();

  // Match 3 (the group's LAST match): Team 2 v Team 3 draw, 1:1 — completes the group.
  const row3 = matchRow(teamNames[1]!, teamNames[2]!);
  await row3.getByRole("button", { name: "Ergebnis eintragen" }).click();
  await row3.getByLabel(/tore heim/i).fill("1");
  await row3.getByLabel(/tore auswärts/i).fill("1");
  await row3.getByRole("button", { name: "Speichern" }).click();
  await expectVisibleAfterSubmit(page, row3.getByText(/1:1/));

  // Group now complete: final table (Endstand), Team 1 clear 1st, Team 2 2nd (better goal difference than Team 3).
  await expectVisibleAfterSubmit(page, groupSection.getByText("Endstand"));
  const table = groupSection.getByRole("table");
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(3);

  // The Final's two placeholder labels are gone — replaced by the resolved teams.
  await expect(spieleSection.getByText("Gruppe A, Platz 1")).toHaveCount(0);
  await expect(spieleSection.getByText("Gruppe A, Platz 2")).toHaveCount(0);
  // Team 1 v Team 2 now identifies TWO rows (their own already-decided
  // group match, plus the Final they were just resolved into) — the Final
  // is the one row NOT tagged with the group name ("Ohne Gruppe").
  const finalRow = spieleSection
    .locator("li")
    .filter({ hasText: "Ohne Gruppe" })
    .filter({ has: page.getByText(teamNames[0]!, { exact: true }) })
    .filter({ has: page.getByText(teamNames[1]!, { exact: true }) });
  await expect(finalRow).toHaveCount(1);
  await expect(finalRow.getByRole("button", { name: "Ergebnis eintragen" })).toBeVisible();

  // Bonus: enter the Final's result too via the same Phase 15 UI.
  await finalRow.getByRole("button", { name: "Ergebnis eintragen" }).click();
  await finalRow.getByLabel(/tore heim/i).fill("1");
  await finalRow.getByLabel(/tore auswärts/i).fill("0");
  await finalRow.getByRole("button", { name: "Speichern" }).click();
  await expectVisibleAfterSubmit(page, finalRow.getByText(/1:0/));
});
