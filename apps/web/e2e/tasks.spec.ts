import path from "node:path";
import { expect, test } from "@playwright/test";
import { getTenantPrisma, prisma } from "@verevia/database";

const PILOT_TENANT_SLUG = process.env.PILOT_TENANT_SLUG ?? "tsv-benediktbeuern";
const API_URL = process.env.API_URL ?? "http://localhost:3001";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Phase 20 happy path: TENANT_ADMIN legt eine Team-Aufgabe an, bearbeitet
 * und markiert sie als erledigt, dann löscht sie. Plus der eigentliche
 * Kernfall von ADR 0016: eine Person OHNE jede eigene Rolle (nur
 * `TeamMember`, wie ein gewöhnlicher Spieler) sieht eine ihr persönlich
 * zugewiesene Aufgabe und markiert sie selbst als erledigt — ein echter,
 * frisch über die Einladung angelegter Account, keine Mock-Session, gleiche
 * Begründung wie guardian-invitation.spec.ts (der rohe Token ist nirgends
 * in der echten UI klickbar).
 *
 * Deliberately plain `expect(...).toBeVisible()` rather than a reload-retry
 * helper for every step after a Server-Action redirect — same reasoning as
 * calendar-events.spec.ts.
 */
test("TENANT_ADMIN legt eine Team-Aufgabe an, bearbeitet, markiert erledigt und löscht sie", async ({ page }) => {
  const title = `E2E Team-Aufgabe ${Date.now()}`;

  await page.goto("/aufgaben/neu");
  await expect(page.getByRole("heading", { name: "Aufgabe anlegen" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel(/für wen/i).selectOption({ label: "E1" });
  await page.getByLabel(/^titel$/i).fill(title);
  await page.getByRole("button", { name: "Aufgabe anlegen" }).click();

  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Offen").first()).toBeVisible();

  await page.getByText(title).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });

  const updatedTitle = `${title} (bearbeitet)`;
  await page.getByLabel(/^titel$/i).fill(updatedTitle);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Als erledigt markieren" }).click();
  await expect(page.getByText("Erledigt").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Wieder öffnen" })).toBeVisible();

  await page.getByRole("button", { name: /aufgabe löschen/i }).click();
  await expect(page.getByRole("heading", { name: "Aufgaben" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(updatedTitle)).toHaveCount(0);
});

test.describe("COACH E1", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "state-coach.json") });

  test("sieht nur eigene Mannschaftsaufgaben, kann eigene Aufgaben anlegen", async ({ page, browser }) => {
    const adminContext = await browser.newContext({ storageState: path.join(__dirname, ".auth", "state.json") });
    const adminPage = await adminContext.newPage();
    const e2Title = `E2E E2-Aufgabe ${Date.now()}`;
    await adminPage.goto("/aufgaben/neu");
    await adminPage.getByLabel(/für wen/i).selectOption({ label: "E2" });
    await adminPage.getByLabel(/^titel$/i).fill(e2Title);
    await adminPage.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(adminPage.getByText(e2Title)).toBeVisible({ timeout: 15_000 });
    await adminContext.close();

    const coachTitle = `E2E Coach Team-Aufgabe ${Date.now()}`;
    await page.goto("/aufgaben");
    await expect(page.getByText(e2Title)).toHaveCount(0);

    await page.getByRole("link", { name: "Aufgabe anlegen" }).click();
    await expect(page.getByRole("heading", { name: "Aufgabe anlegen" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/^titel$/i).fill(coachTitle);
    await page.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(page.getByText(coachTitle)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(e2Title)).toHaveCount(0);
  });
});

/**
 * Zentraler Fall von ADR 0016: eine Person ohne eigene Rolle (nur
 * `TeamMember`) sieht ihre persönlich zugewiesene Aufgabe und markiert sie
 * selbst als erledigt — unabhängig von jeder RoleAssignment.
 */
test("eine Person ohne eigene Rolle markiert ihre persönlich zugewiesene Aufgabe selbst als erledigt", async ({ page, browser }) => {
  // Viele chained Schritte (Person anlegen, Teammitgliedschaft, Aufgabe
  // anlegen, Einladung, Signup) — unter SSH-Tunnel-Latenz weit über dem
  // 30s-Default, gleiches Muster wie attendance.spec.ts. 120s statt 90s,
  // da diese VPS-Verifikationssitzung wiederholt ungewöhnlich hohe Latenz/
  // Tunnel-Instabilität zeigte (siehe PHASE_20-Bericht).
  test.setTimeout(120_000);
  const suffix = Date.now();
  const assigneeLastName = `E2EAufgabeZiel${suffix}`;
  const taskTitle = `E2E Self-Service Aufgabe ${suffix}`;

  // Person anlegen und der Mannschaft E1 hinzufügen (kein RoleAssignment).
  // Großzügigere Timeouts als der 5s-Default — unter SSH-Tunnel-Latenz
  // bereits an anderer Stelle als nötig erkannt (siehe PHASE_18/19-Berichte).
  await page.goto("/personen");
  await page.getByLabel(/vorname der neuen person/i).fill("E2E");
  await page.getByLabel(/nachname der neuen person/i).fill(assigneeLastName);
  await page.getByRole("button", { name: "Person anlegen" }).click();
  await expect(page.locator(`input[value="${assigneeLastName}"]`)).toBeVisible({ timeout: 15_000 });

  await page.goto("/");
  await page.locator("main").getByRole("link", { name: "Fußball" }).click();
  await page.getByRole("link", { name: "E1" }).click();
  await expect(page.getByRole("heading", { name: "E1" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Person hinzufügen").selectOption({ label: `E2E ${assigneeLastName}` });
  await page.getByRole("button", { name: "Person hinzufügen" }).click();
  await expect(page.getByText(`E2E ${assigneeLastName}`)).toBeVisible({ timeout: 15_000 });

  // Aufgabe für diese Person anlegen.
  await page.goto("/aufgaben/neu");
  await expect(page.getByRole("heading", { name: "Aufgabe anlegen" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel(/für wen/i).selectOption({ label: `E2E ${assigneeLastName}` });
  await page.getByLabel(/^titel$/i).fill(taskTitle);
  await page.getByRole("button", { name: "Aufgabe anlegen" }).click();
  await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 15_000 });
  await page.getByText(taskTitle).click();
  await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible({ timeout: 15_000 });
  const taskPath = new URL(page.url()).pathname;

  // Die Zielperson per Einladung real einen Account anlegen lassen.
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: PILOT_TENANT_SLUG } });
  const db = getTenantPrisma(tenant.id);
  const assigneePerson = await db.person.findFirstOrThrow({
    where: { tenantId: tenant.id, firstName: "E2E", lastName: assigneeLastName },
  });

  const email = `e2e-task-assignee-${suffix}@example.invalid`;
  const inviteResponse = await page.request.post(
    `${API_URL}/api/v1/persons/${assigneePerson.id}/invitations`,
    { headers: { "x-tenant-id": tenant.id }, data: { email } },
  );
  expect(inviteResponse.ok()).toBe(true);
  const invitation = (await inviteResponse.json()) as { token: string };

  const assigneeContext = await browser.newContext({ baseURL: APP_URL });
  const assigneePage = await assigneeContext.newPage();
  await assigneePage.goto(`/einladung/${invitation.token}`);
  await expect(assigneePage.getByText(new RegExp("Einladung zu", "i"))).toBeVisible();
  await assigneePage.getByLabel("Dein Name").fill(`E2E ${assigneeLastName} Account`);
  await assigneePage.getByLabel("Passwort festlegen").fill("Sup3rSicher!Assignee");
  await assigneePage.getByRole("button", { name: "Konto erstellen und Einladung annehmen" }).click();
  await assigneePage.waitForURL("**/");

  // Die Zielperson öffnet die ihr zugewiesene Aufgabe direkt über die URL —
  // /aufgaben selbst wäre für sie leer (keine RoleAssignment, keine
  // RBAC-Leseliste), aber die Detailseite gewährt ihr über den
  // Self-Service-Pfad (ADR 0016) trotzdem Zugriff, da sie die Zielperson ist.
  await assigneePage.goto(taskPath);
  await expect(assigneePage.getByRole("heading", { name: taskTitle })).toBeVisible({ timeout: 15_000 });
  await expect(assigneePage.getByLabel(/^titel$/i)).toHaveCount(0);
  await expect(assigneePage.getByText(/aufgabe löschen/i)).toHaveCount(0);

  await assigneePage.getByRole("button", { name: "Als erledigt markieren" }).click();
  await expect(assigneePage.getByText("Erledigt").first()).toBeVisible({ timeout: 15_000 });

  await assigneeContext.close();
});
