import { expect, type Locator, type Page, test } from "@playwright/test";

/** Same reload-retry helper as the other tournament E2E specs — safe here since none of these steps wait on a pending Server Action redirect. */
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
 * Phase 17 core flow, driven through two real, separate browser identities
 * — exactly as it would happen in production: a TENANT_ADMIN (the default
 * authenticated `page` fixture) builds and manages a tournament, while a
 * genuinely anonymous visitor (a fresh, storage-state-free browser context
 * opened explicitly below — NOT the globally configured authenticated
 * session) views the public page. Verifies both halves of the actual
 * product rule: a DRAFT tournament is not yet public, and a
 * PLANNED tournament with entered results is fully visible without login,
 * including live-computed group standings — with zero edit affordances
 * reaching the anonymous visitor.
 */
test("Ein anonymer Besucher sieht ein veröffentlichtes Turnier mit Live-Tabelle, aber keinen Entwurf", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const tournamentName = `E2E Public Page Cup ${Date.now()}`;
  const teamNames = ["Team Öffentlich Eins", "Team Öffentlich Zwei"].map((name) => `${name} ${Date.now()}`);

  await page.goto("/fussball");
  await page.getByRole("link", { name: "Turniere" }).click();
  await page.getByRole("link", { name: "Turnier anlegen" }).click();

  await page.getByLabel(/^name$/i).fill(tournamentName);
  await page.getByLabel("Beginn").fill("2026-12-19T09:00");
  await page.getByLabel(/^modus$/i).selectOption({ label: "Gruppenphase" });
  await page.getByRole("button", { name: "Turnier anlegen" }).click();
  // Same known SSH-tunnel-latency-vs-reload race as every other tournament
  // spec's creation step (see PHASE_16 report) — wait for the redirect via
  // URL instead of a reload-retrying heading check.
  await page.waitForURL(/\/fussball\/turniere\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: tournamentName })).toBeVisible();
  const tournamentUrl = page.url();
  const tournamentId = tournamentUrl.split("/").pop()!;
  const publicUrl = `/turnier/${tournamentId}`;

  // A brand-new, storage-state-free context — a genuinely anonymous
  // visitor, not the suite's authenticated session.
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();

  // Freshly created tournaments default to DRAFT (no status field on the
  // create form) — not yet meant to be public. Asserting on the real HTTP
  // status (not page text) — version-independent, doesn't depend on the
  // exact wording of Next's default not-found page.
  const draftResponse = await anonPage.goto(publicUrl);
  expect(draftResponse?.status()).toBe(404);

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

  const venueForm = page.locator("form", { has: page.getByLabel(/spielstätte auswählen/i) });
  await venueForm.getByLabel(/spielstätte auswählen/i).selectOption({ label: "Sportplatz Benediktbeuern" });
  await venueForm.getByRole("button", { name: "Zuordnen" }).click();
  await expectVisibleAfterSubmit(page, page.locator("li", { has: page.getByRole("button", { name: "Entfernen" }) }));

  // Publish: DRAFT → Geplant, before any match exists yet (no ambiguity with the later result-entry "Speichern" button).
  const overviewForm = page.locator("form", { has: page.getByLabel("Status") });
  await overviewForm.getByLabel("Status").selectOption({ label: "Geplant" });
  await overviewForm.getByRole("button", { name: "Speichern" }).click();
  // "Geplant" also appears as an <option> text inside the Status <select>
  // itself — page.getByText("Geplant") alone is ambiguous (strict-mode
  // violation). The status badge is the only actual <span> with this text.
  await expectVisibleAfterSubmit(page, page.locator("span", { hasText: "Geplant" }));

  // Now public: name, status, and the (still empty) group are visible to the anonymous visitor.
  await anonPage.goto(publicUrl);
  await expectVisibleAfterSubmit(anonPage, anonPage.getByRole("heading", { name: tournamentName }));
  await expect(anonPage.getByText("Geplant")).toBeVisible();
  // "Gruppe A" also appears as each participant's group tag in the
  // Teilnehmer section — scope to the Gruppen section's own heading span.
  const anonGroupsSection = anonPage.locator("section", { has: anonPage.getByRole("heading", { name: "Gruppen" }) });
  await expect(anonGroupsSection.getByText("Gruppe A")).toBeVisible();
  await expect(anonPage.getByRole("table")).toHaveCount(0); // no completed match yet

  const matchForm = page.locator("form", { has: page.getByRole("button", { name: "Spiel anlegen" }) });
  await matchForm.getByLabel("Heimmannschaft").selectOption({ label: teamNames[0]! });
  await matchForm.getByLabel("Auswärtsmannschaft").selectOption({ label: teamNames[1]! });
  await matchForm.getByLabel("Datum und Uhrzeit").fill("2026-12-19T10:00");
  await matchForm.getByLabel("Heim/Auswärts").selectOption({ label: "Neutraler Platz" });
  await matchForm.getByLabel("Gruppe", { exact: true }).selectOption({ label: "Gruppe A" });
  await matchForm.getByLabel("Spielstätte").selectOption({ label: "Sportplatz Benediktbeuern" });
  await matchForm.getByRole("button", { name: "Spiel anlegen" }).click();

  const spieleSection = page.locator("section", { has: page.getByRole("heading", { name: "Spiele" }) });
  const matchRow = spieleSection.locator("li").filter({ has: page.getByText(teamNames[0]!, { exact: true }) }).filter({ has: page.getByText(teamNames[1]!, { exact: true }) });
  await expectVisibleAfterSubmit(page, matchRow.getByRole("button", { name: "Ergebnis eintragen" }));
  await matchRow.getByRole("button", { name: "Ergebnis eintragen" }).click();
  await matchRow.getByLabel(/tore heim/i).fill("2");
  await matchRow.getByLabel(/tore auswärts/i).fill("0");
  await matchRow.getByRole("button", { name: "Speichern" }).click();
  await expectVisibleAfterSubmit(page, matchRow.getByText(/2:0/));

  // The anonymous visitor now sees the live standings table AND the match result — a full refresh/re-navigation, not a stale cache.
  await anonPage.goto(publicUrl);
  await expectVisibleAfterSubmit(anonPage, anonPage.getByRole("table"));
  const table = anonPage.getByRole("table");
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(table.getByText(teamNames[0]!, { exact: true })).toBeVisible();
  // "2:0" also appears as the standings table's Tore cell (goalsFor:goalsAgainst) — scope to the Spiele section's own match row for the actual result display.
  const anonSpieleSection = anonPage.locator("section", { has: anonPage.getByRole("heading", { name: "Spiele" }) });
  await expect(anonSpieleSection.getByText(/2:0/)).toBeVisible();

  // No edit affordances of any kind reach the anonymous visitor.
  await expect(anonPage.getByRole("button")).toHaveCount(0);
  await expect(anonPage.getByRole("textbox")).toHaveCount(0);
  await expect(anonPage.getByRole("link", { name: "KO-Baum erstellen" })).toHaveCount(0);

  await anonContext.close();
});
