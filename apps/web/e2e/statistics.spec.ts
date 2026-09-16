import path from "node:path";
import { expect, test } from "@playwright/test";
import { getTenantPrisma, prisma } from "@verevia/database";

const PILOT_TENANT_SLUG = process.env.PILOT_TENANT_SLUG ?? "tsv-benediktbeuern";

/**
 * Phase 21 happy path: TENANT_ADMIN legt eine frisch isolierte Mannschaft
 * mit genau einem abgeschlossenen Spiel und einem Termin mit erfasster
 * Anwesenheit an (über TeamSeason gibt es bewusst keine UI — siehe
 * PHASE_21_STATISTICS_REPORT.md — daher TeamSeason/Match hier direkt per
 * Prisma, alles andere über die echte UI, gleiches Muster wie
 * attendance.spec.ts) → öffnet Statistik → wählt die Mannschaft →
 * die angezeigten Kennzahlen stimmen mit den angelegten Daten überein.
 * Eine eigene, frische Mannschaft statt einer seeded (E1/E2) vermeidet
 * Interferenz mit den Spielen, die andere Spec-Dateien (z. B.
 * match-foundation.spec.ts) parallel für E1/E2 anlegen. Der Mannschaftsname
 * bewusst NICHT mit "E2E " (bzw. irgendetwas, das mit "E2" beginnt) —
 * club-structure.spec.ts/football-season.spec.ts suchen auf der
 * Fußball-Übersicht per Substring-Match nach "E2" (der seeded Mannschaft);
 * ein Teamname wie "E2E Statistik ..." würde dort ebenfalls matchen
 * (Playwright-Name-Matching ist standardmäßig Substring) und diese
 * bestehenden Tests brechen — real reproduziert und hier bewusst vermieden.
 */
test("TENANT_ADMIN sieht für eine Mannschaft/Saison die korrekten Statistik-Kennzahlen", async ({ page }) => {
  test.setTimeout(60_000);
  const suffix = Date.now();
  const teamName = `Statistiktest ${suffix}`;
  const playerLastName = `E2EStatistikSpieler${suffix}`;
  const eventTitle = `E2E Statistik Training ${suffix}`;

  // Kadermitglied anlegen (für die Anwesenheitserfassung).
  await page.goto("/personen");
  await page.getByLabel(/vorname der neuen person/i).fill("E2E");
  await page.getByLabel(/nachname der neuen person/i).fill(playerLastName);
  await page.getByRole("button", { name: "Person anlegen" }).click();
  await expect(page.locator(`input[value="${playerLastName}"]`)).toBeVisible();

  // Frische Mannschaft anlegen.
  await page.goto("/");
  await page.locator("main").getByRole("link", { name: "Fußball" }).click();
  await expect(page.getByRole("heading", { name: "Fußball" })).toBeVisible();
  await page.getByLabel("Name der neuen Mannschaft").fill(teamName);
  await page.getByRole("button", { name: "Mannschaft anlegen" }).click();
  await expect(page.getByText(teamName)).toBeVisible();
  await page.getByText(teamName).click();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
  const teamId = new URL(page.url()).pathname.split("/").pop()!;

  await page.getByLabel("Person hinzufügen").selectOption({ label: `E2E ${playerLastName}` });
  await page.getByRole("button", { name: "Person hinzufügen" }).click();
  await expect(page.getByText(`E2E ${playerLastName}`)).toBeVisible();

  // TeamSeason + ein abgeschlossenes Spiel (3:1 Heimsieg) direkt per Prisma
  // — für die Team→Saison-Zuordnung selbst existiert keine UI (nur
  // Seed-Daten), siehe Abschnitt 6 des Phase-21-Arbeitsauftrags.
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: PILOT_TENANT_SLUG } });
  const db = getTenantPrisma(tenant.id);
  const footballDepartment = await db.department.findFirstOrThrow({
    where: { tenantId: tenant.id, sportType: "FOOTBALL" },
  });
  const activeSeason = await db.season.findFirstOrThrow({
    where: { tenantId: tenant.id, departmentId: footballDepartment.id, status: "ACTIVE" },
  });
  const ageGroup = await db.ageGroup.findFirstOrThrow({ where: { tenantId: tenant.id, name: "E-Jugend" } });

  const teamSeason = await db.teamSeason.create({
    data: { tenantId: tenant.id, teamId, seasonId: activeSeason.id, ageGroupId: ageGroup.id },
  });

  await db.footballMatch.create({
    data: {
      tenantId: tenant.id,
      teamSeasonId: teamSeason.id,
      opponentName: `E2E Statistik Gegner ${suffix}`,
      startsAt: new Date("2026-10-25T10:00:00Z"),
      type: "FRIENDLY",
      homeAway: "HOME",
      status: "COMPLETED",
      homeScore: 3,
      awayScore: 1,
    },
  });
  // Ein zukünftiges, noch nicht ausgetragenes Spiel — darf laut Abschnitt 14
  // NICHT in die Spielbilanz einfließen.
  await db.footballMatch.create({
    data: {
      tenantId: tenant.id,
      teamSeasonId: teamSeason.id,
      opponentName: `E2E Statistik Zukunftsgegner ${suffix}`,
      startsAt: new Date("2027-03-01T10:00:00Z"),
      type: "FRIENDLY",
      homeAway: "HOME",
      status: "SCHEDULED",
    },
  });

  // Termin für die neue Mannschaft anlegen und Anwesenheit erfassen.
  await page.goto("/kalender/neu");
  await expect(page.getByRole("heading", { name: "Termin anlegen" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel(/für wen/i).selectOption({ label: teamName });
  await page.getByLabel(/^titel$/i).fill(eventTitle);
  await page.getByLabel("Beginn").fill("2026-10-26T17:00");
  await page.getByLabel("Ende").fill("2026-10-26T18:30");
  await page.getByRole("button", { name: "Termin anlegen" }).click();

  await expect(page.getByText(eventTitle)).toBeVisible({ timeout: 15_000 });
  await page.getByText(eventTitle).click();
  await expect(page.getByRole("heading", { name: eventTitle })).toBeVisible({ timeout: 15_000 });

  const playerRow = page.locator("li", { hasText: `E2E ${playerLastName}` });
  await expect(playerRow).toBeVisible();
  await playerRow.getByRole("button", { name: "War da" }).click();
  await expect(playerRow.getByText(/war anwesend/i)).toBeVisible({ timeout: 10_000 });

  // Statistik öffnen und die neue Mannschaft/Saison auswählen.
  await page.goto("/statistik");
  await expect(page.getByRole("heading", { name: "Statistik" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: new RegExp(`${teamName} \\(E-Jugend\\)`) }).click();
  await expect(page.getByRole("heading", { name: teamName })).toBeVisible({ timeout: 15_000 });

  // Spielbilanz: 1 gespielt (das zukünftige zählt nicht), 1 Sieg.
  await expect(page.getByLabel("Spiele: 1")).toBeVisible();
  await expect(page.getByLabel("Siege: 1")).toBeVisible();
  await expect(page.getByLabel("Unentschieden: 0")).toBeVisible();
  await expect(page.getByLabel("Niederlagen: 0")).toBeVisible();

  // Torbilanz: 3:1, Tordifferenz +2.
  await expect(page.getByLabel("Tore: 3")).toBeVisible();
  await expect(page.getByLabel("Gegentore: 1")).toBeVisible();
  await expect(page.getByLabel("Tordifferenz: +2")).toBeVisible();

  // Anwesenheit: 1 Termin, 1× anwesend, Quote 100%.
  await expect(page.getByLabel("Termine: 1")).toBeVisible();
  await expect(page.getByLabel("Anwesend: 1")).toBeVisible();
  await expect(page.getByLabel("Abwesend: 0")).toBeVisible();
  await expect(page.getByLabel("Offen: 0")).toBeVisible();
  await expect(page.getByText("Anwesenheitsquote")).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();
});

/**
 * Kein Zugriff auf fremde Statistik: COACH E1 hat keine Berechtigung auf
 * eine Mannschaft, der er nicht zugeordnet ist (`canOnMatch`), und darf
 * daher auch nicht deren Statistik sehen — direkter URL-Aufruf liefert die
 * 403-Meldung statt Kennzahlen. Nutzt dieselbe frisch angelegte Mannschaft
 * wie der Happy-Path-Test oben (setup in einem `beforeAll`, damit dieser
 * Test unabhängig von dessen Ausführung/-reihenfolge eine gültige, aber für
 * COACH E1 fremde TeamSeason vorfindet).
 */
test.describe("COACH E1 — kein Zugriff auf fremde Statistik", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("erhält beim direkten Aufruf einer fremden Team-/Saisonstatistik keine Kennzahlen", async ({ page }) => {
    const suffix = Date.now();
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: PILOT_TENANT_SLUG } });
    const db = getTenantPrisma(tenant.id);
    const footballDepartment = await db.department.findFirstOrThrow({
      where: { tenantId: tenant.id, sportType: "FOOTBALL" },
    });
    const activeSeason = await db.season.findFirstOrThrow({
      where: { tenantId: tenant.id, departmentId: footballDepartment.id, status: "ACTIVE" },
    });
    const ageGroup = await db.ageGroup.findFirstOrThrow({ where: { tenantId: tenant.id, name: "E-Jugend" } });
    // Name bewusst nicht "E2E ..." — siehe Kommentar am Happy-Path-Test
    // oben (Substring-Kollision mit "E2" auf der Fußball-Übersicht).
    const foreignTeam = await db.team.create({
      data: { tenantId: tenant.id, departmentId: footballDepartment.id, name: `Statistiktest-Fremd ${suffix}` },
    });
    const foreignTeamSeason = await db.teamSeason.create({
      data: { tenantId: tenant.id, teamId: foreignTeam.id, seasonId: activeSeason.id, ageGroupId: ageGroup.id },
    });

    await page.goto(`/statistik/${foreignTeamSeason.id}`);
    await expect(page.getByText(/keine berechtigung/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Spielbilanz")).toHaveCount(0);
  });
});
