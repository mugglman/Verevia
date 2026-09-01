import { expect, type Locator, type Page, test } from "@playwright/test";
import { getTenantPrisma, prisma } from "@verevia/database";

const PILOT_TENANT_SLUG = process.env.PILOT_TENANT_SLUG ?? "tsv-benediktbeuern";
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** Same reload-retry helper as tournament-schedule.spec.ts/tournament-knockout.spec.ts — mitigates known SSH-tunnel-latency flakiness on post-submit navigations. */
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
 * Phase 14 happy path: TENANT_ADMIN builds a knockout bracket via the real
 * UI (same flow as tournament-knockout.spec.ts), then finalizes the first
 * semifinal's result. No tournament-match result-entry UI exists yet (see
 * Phase 14 report §23/§43 — match-detail.tsx only supports club matches)
 * and building one solely to drive this test would be exactly the kind of
 * scope creep the work order explicitly warns against ("baue nicht nur
 * für E2E eine komplette neue Ergebnisverwaltung"). So the result is
 * recorded via a direct, session-authenticated call to the real, already-
 * existing result endpoint (`page.request.patch`, sharing the browser
 * context's admin session cookie) — the exact same precedent already
 * established in guardian-invitation.spec.ts for a step with no UI
 * equivalent. Everything else (bracket creation, the resulting visibility
 * change) runs through the real browser exactly as a user would see it.
 */
test("TENANT_ADMIN finalisiert ein Halbfinale, der Sieger erscheint automatisch im Finale", async ({ page }) => {
  test.setTimeout(120_000);
  const tournamentName = `E2E Slot Resolution Cup ${Date.now()}`;
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
  await page.getByRole("button", { name: "KO-Baum berechnen" }).click();
  await expect(page.getByText(/erfüllt alle eingestellten pausen/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /ko-baum übernehmen \(3 spiele\)/i }).click();
  await expect(page).toHaveURL(/\/fussball\/turniere\/[^/]+$/, { timeout: 15_000 });

  // Before any result: the Final shows the honest "not yet decided" fallback label.
  await expectVisibleAfterSubmit(page, page.getByText("Sieger (steht noch nicht fest)").first());

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: PILOT_TENANT_SLUG } });
  const db = getTenantPrisma(tenant.id);
  const tournamentId = page.url().split("/").pop()!;
  const matches = await db.footballMatch.findMany({ where: { tenantId: tenant.id, tournamentId }, orderBy: { startsAt: "asc" } });
  const semifinal1 = matches[0]!; // startsAt asc: SF-1 is first

  const resultResponse = await page.request.patch(`${API_URL}/api/v1/football/matches/${semifinal1.id}`, {
    headers: { "x-tenant-id": tenant.id },
    data: { status: "COMPLETED", homeScore: 2, awayScore: 1 },
  });
  expect(resultResponse.ok()).toBe(true);

  // Reload: the Final's home side is no longer pending — the winner's real
  // name appears. Scoped to the row that STILL shows the pending label
  // (uniquely the Final, whose AWAY side isn't resolved yet) — a plain
  // `hasText: teamNames[0]` would also match SF-1's own, unrelated row
  // ("Team Nord ... – Team West ... 2:1"), a Playwright strict-mode
  // violation (two matching elements).
  await page.reload();
  const finalRow = page.locator("li", { has: page.getByText("Sieger (steht noch nicht fest)") });
  await expectVisibleAfterSubmit(page, finalRow.locator("p.font-medium", { hasText: teamNames[0]! }));
  await expect(page.getByText("Sieger (steht noch nicht fest)")).toHaveCount(1); // only the Final's still-pending AWAY side remains
});
