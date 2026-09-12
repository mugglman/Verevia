import path from "node:path";
import { expect, test } from "@playwright/test";
import { getTenantPrisma, prisma } from "@verevia/database";

const PILOT_TENANT_SLUG = process.env.PILOT_TENANT_SLUG ?? "tsv-benediktbeuern";
const API_URL = process.env.API_URL ?? "http://localhost:3001";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Phase 19 happy path: TENANT_ADMIN legt einen Team-Termin an → sieht das
 * volle Roster (inkl. des seeded COACH/TeamMember Max Mustermann) → markiert
 * dessen tatsächliche Anwesenheit. Zusätzlich COACH E1 (Max selbst): sagt für
 * sich selbst zu (Self-Service-Pfad über die eigene Mannschaftszugehörigkeit,
 * nicht über eine RoleAssignment-Leseerlaubnis). Zusätzlich der eigentliche
 * Kernfall von ADR 0015: ein Erziehungsberechtigter OHNE eigene Rolle sagt
 * für sein verifiziertes Kind zu — ein echter, frisch über die Einladung
 * angelegter Account, keine Mock-Session.
 *
 * Deliberately plain `expect(...).toBeVisible()` rather than a reload-retry
 * helper for every step after a Server-Action redirect — same reasoning as
 * calendar-events.spec.ts.
 */
test("TENANT_ADMIN legt einen Termin an und markiert die tatsächliche Anwesenheit", async ({ page }) => {
  const title = `E2E Attendance Training ${Date.now()}`;

  await page.goto("/kalender/neu");
  await expect(page.getByRole("heading", { name: "Termin anlegen" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel(/für wen/i).selectOption({ label: "E1" });
  await page.getByLabel(/^titel$/i).fill(title);
  await page.getByLabel("Beginn").fill("2026-10-20T17:00");
  await page.getByLabel("Ende").fill("2026-10-20T18:30");
  await page.getByRole("button", { name: "Termin anlegen" }).click();

  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  await page.getByText(title).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });

  // Max Mustermann ist seeded E1-TeamMember (und zugleich COACH) — steht
  // also auf dem Roster, unabhängig von seiner Rolle.
  await expect(page.getByText("Anwesenheit")).toBeVisible();
  const maxRow = page.locator("li", { hasText: "Max Mustermann" });
  await expect(maxRow).toBeVisible();
  await expect(maxRow.getByText(/keine rückmeldung/i)).toBeVisible();

  await maxRow.getByRole("button", { name: "War da" }).click();
  await expect(page.locator("li", { hasText: "Max Mustermann" }).getByText(/war anwesend/i)).toBeVisible({ timeout: 10_000 });
});

test.describe("COACH E1 — Self-Service-RSVP für sich selbst", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("ein Trainer, der zugleich TeamMember ist, sagt für sich selbst zu", async ({ page }) => {
    const title = `E2E Coach Self-RSVP ${Date.now()}`;

    // Die COACH-E1-Fixture (global-setup.ts) trägt bewusst nur eine
    // RoleAssignment, keine TeamMember-Zeile (ein Trainer muss nicht
    // zwingend selbst im Kader stehen). Für DIESEN Test (Selbst-RSVP über
    // Mannschaftszugehörigkeit, nicht über die Coach-Rolle) wird die
    // Fixture-Person hier zusätzlich als TeamMember von E1 eingetragen —
    // ein ganz normaler, real vorkommender Fall (ein Trainer, der auch
    // mitspielt, siehe seed.ts/Max Mustermann).
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: PILOT_TENANT_SLUG } });
    const db = getTenantPrisma(tenant.id);
    const coachPerson = await db.person.findFirstOrThrow({
      where: { tenantId: tenant.id, firstName: "E2E", lastName: "CoachE1" },
    });
    const teamE1 = await db.team.findFirstOrThrow({ where: { tenantId: tenant.id, name: "E1" } });
    const existingMembership = await db.teamMember.findFirst({
      where: { tenantId: tenant.id, personId: coachPerson.id, teamId: teamE1.id },
    });
    if (!existingMembership) {
      await db.teamMember.create({ data: { tenantId: tenant.id, personId: coachPerson.id, teamId: teamE1.id, status: "ACTIVE" } });
    }

    await page.goto("/kalender/neu");
    await expect(page.getByRole("heading", { name: "Termin anlegen" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/^titel$/i).fill(title);
    await page.getByLabel("Beginn").fill("2026-10-21T17:00");
    await page.getByLabel("Ende").fill("2026-10-21T18:00");
    await page.getByRole("button", { name: "Termin anlegen" }).click();

    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
    await page.getByText(title).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });

    const coachRow = page.locator("li", { hasText: "E2E CoachE1" });
    await expect(coachRow).toBeVisible({ timeout: 10_000 });
    await coachRow.getByRole("button", { name: "Zusagen" }).click();
    await expect(coachRow.getByText(/zugesagt/i)).toBeVisible({ timeout: 10_000 });
  });
});

/**
 * Zentraler Fall von ADR 0015: ein Erziehungsberechtigter OHNE eigene Rolle
 * sieht das Event nicht über den RBAC-Pfad (EventsService.canAccess),
 * sondern ausschließlich über den Self-Service-Pfad für sein verifiziertes
 * Kind. Baut Kind, Elternteil, Beziehung, Teammitgliedschaft und Einladung
 * real über die Anwendung auf — kein Mock. Die Einladung selbst wird per
 * direktem, session-authentifiziertem API-Aufruf erzeugt (wie
 * guardian-invitation.spec.ts: der rohe Token ist nirgends in der echten UI
 * klickbar, nur `tokenHash` wird persistiert), jeder Schritt danach läuft
 * über einen echten, frischen Browser-Kontext.
 */
test("Erziehungsberechtigter ohne eigene Rolle sagt für sein verifiziertes Kind zu", async ({ page, browser }) => {
  // Viele chained Schritte (2× Person anlegen, Beziehung, Teammitgliedschaft,
  // Termin anlegen, Einladung, Signup, reduzierte Detailseite mit zwei
  // parallelen Fetches, RSVP-Submit) — unter SSH-Tunnel-Latenz weit über dem
  // 30s-Default, gleiches Muster wie tournament-core.spec.ts.
  test.setTimeout(90_000);
  const suffix = Date.now();
  const childLastName = `E2EAnwesenheitKind${suffix}`;
  const parentLastName = `E2EAnwesenheitEltern${suffix}`;
  const eventTitle = `E2E Guardian RSVP Training ${suffix}`;

  // Kind anlegen und der Mannschaft E1 hinzufügen.
  await page.goto("/personen");
  await page.getByLabel(/vorname der neuen person/i).fill("E2E");
  await page.getByLabel(/nachname der neuen person/i).fill(childLastName);
  await page.getByRole("button", { name: "Person anlegen" }).click();
  await expect(page.locator(`input[value="${childLastName}"]`)).toBeVisible();

  await page.goto("/");
  await page.locator("main").getByRole("link", { name: "Fußball" }).click();
  await page.getByRole("link", { name: "E1" }).click();
  await expect(page.getByRole("heading", { name: "E1" })).toBeVisible();
  await page.getByLabel("Person hinzufügen").selectOption({ label: `E2E ${childLastName}` });
  await page.getByRole("button", { name: "Person hinzufügen" }).click();
  await expect(page.getByText(`E2E ${childLastName}`)).toBeVisible();

  // Elternteil anlegen, als Erziehungsberechtigter verknüpfen (die
  // Admin-UI verifiziert die Beziehung direkt beim Anlegen — siehe
  // guardian-invitation.spec.ts, derselbe etablierte Fluss).
  await page.goto("/personen");
  await page.getByLabel(/vorname der neuen person/i).fill("E2E");
  await page.getByLabel(/nachname der neuen person/i).fill(parentLastName);
  await page.getByRole("button", { name: "Person anlegen" }).click();
  const parentCard = page.locator("li").filter({ has: page.locator(`input[value="${parentLastName}"]`) });
  await expect(parentCard).toBeVisible();
  await parentCard.getByLabel("Person auswählen").selectOption({ label: `E2E ${childLastName}` });
  await parentCard.getByLabel("Beziehungstyp").selectOption({ label: "Erziehungsberechtigter" });
  await parentCard.getByRole("button", { name: "Beziehung hinzufügen" }).click();
  await expect(parentCard.getByText(`Erziehungsberechtigter von E2E ${childLastName}`)).toBeVisible();

  // Termin für E1 anlegen.
  await page.goto("/kalender/neu");
  await expect(page.getByRole("heading", { name: "Termin anlegen" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel(/für wen/i).selectOption({ label: "E1" });
  await page.getByLabel(/^titel$/i).fill(eventTitle);
  await page.getByLabel("Beginn").fill("2026-10-22T17:00");
  await page.getByLabel("Ende").fill("2026-10-22T18:00");
  await page.getByRole("button", { name: "Termin anlegen" }).click();
  await expect(page.getByText(eventTitle)).toBeVisible({ timeout: 15_000 });
  await page.getByText(eventTitle).click();
  await expect(page.getByRole("heading", { name: eventTitle })).toBeVisible({ timeout: 15_000 });
  const eventPath = new URL(page.url()).pathname;

  // Elternteil per Einladung real einen Account anlegen lassen.
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: PILOT_TENANT_SLUG } });
  const db = getTenantPrisma(tenant.id);
  const parentPerson = await db.person.findFirstOrThrow({
    where: { tenantId: tenant.id, firstName: "E2E", lastName: parentLastName },
  });

  const email = `e2e-attendance-guardian-${suffix}@example.invalid`;
  const inviteResponse = await page.request.post(
    `${API_URL}/api/v1/persons/${parentPerson.id}/invitations`,
    { headers: { "x-tenant-id": tenant.id }, data: { email } },
  );
  expect(inviteResponse.ok()).toBe(true);
  const invitation = (await inviteResponse.json()) as { token: string };

  // Frischer, nicht-authentifizierter Kontext für den Elternteil.
  const guardianContext = await browser.newContext({ baseURL: APP_URL });
  const guardianPage = await guardianContext.newPage();
  await guardianPage.goto(`/einladung/${invitation.token}`);
  await expect(guardianPage.getByText(new RegExp("Einladung zu", "i"))).toBeVisible();
  await guardianPage.getByLabel("Dein Name").fill(`E2E ${parentLastName} Account`);
  await guardianPage.getByLabel("Passwort festlegen").fill("Sup3rSicher!Guardian");
  await guardianPage.getByRole("button", { name: "Konto erstellen und Einladung annehmen" }).click();
  await guardianPage.waitForURL("**/");

  // Elternteil ohne eigene Rolle öffnet den Termin direkt über die URL —
  // /kalender selbst wäre für ihn leer (RBAC-Leseliste), aber die
  // Detailseite fällt für ihn auf die reduzierte Self-Service-Ansicht
  // zurück (ADR 0015), da sein Kind auf dem Roster steht.
  await guardianPage.goto(eventPath);
  await expect(guardianPage.getByRole("heading", { name: eventTitle })).toBeVisible({ timeout: 15_000 });
  // Keine Verwaltungsformulare für den Elternteil.
  await expect(guardianPage.getByLabel(/^titel$/i)).toHaveCount(0);
  await expect(guardianPage.getByText(/termin löschen/i)).toHaveCount(0);

  const childRow = guardianPage.locator("li", { hasText: `E2E ${childLastName}` });
  await expect(childRow).toBeVisible();
  await childRow.getByRole("button", { name: "Zusagen" }).click();
  // Nach dem Submit rendert die reduzierte Ansicht neu und feuert dabei
  // erneut BEIDE parallelen Fetches (auch den für sie ohnehin 403endenden
  // /events/:id) — unter SSH-Tunnel-Latenz großzügigeres Timeout als der
  // 5s-Default, gleiches Muster wie /kalender/neu (siehe PHASE_18-Bericht).
  await expect(guardianPage.locator("li", { hasText: `E2E ${childLastName}` }).getByText(/zugesagt/i)).toBeVisible({ timeout: 15_000 });

  // Der Elternteil selbst steht NICHT auf dem Roster — kein
  // Zusagen/Absagen für die eigene Zeile (er hat gar keine eigene Zeile).
  await expect(guardianPage.getByText(`E2E ${parentLastName}`)).toHaveCount(0);

  await guardianContext.close();
});
