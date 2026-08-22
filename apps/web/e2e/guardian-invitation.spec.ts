import { expect, test } from "@playwright/test";
import { getTenantPrisma, prisma } from "@verevia/database";

const PILOT_TENANT_SLUG = process.env.PILOT_TENANT_SLUG ?? "tsv-benediktbeuern";
const API_URL = process.env.API_URL ?? "http://localhost:3001";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * The central E2E test of Phase 6 (section 28): Admin → Person Kind →
 * Person Elternteil → Relationship LEGAL_GUARDIAN → Account für
 * Elternteil einladen → Einladung annehmen → Login Elternteil → Kind
 * sichtbar → fremdes Kind nicht sichtbar.
 *
 * Uses the default (TENANT_ADMIN) storageState for the admin steps
 * (person creation, relationship, invitation). The invitation itself is
 * created via a direct, session-authenticated API call
 * (`page.request.post`, sharing the browser context's admin session
 * cookie) rather than clicking "Account einladen" in the UI: the raw
 * token is deliberately unrecoverable once the UI's server action
 * discards it (only `tokenHash` is ever persisted, see
 * AccountInvitation's schema comment) — there is no token display
 * anywhere in the real UI to click through, by design. Every step after
 * that (visiting /einladung/[token], signing up, and viewing
 * /meine-kinder) runs through the real browser exactly as a real user
 * would experience it.
 */
test("Guardian-Invitation-Flow: Admin verknüpft Elternteil mit Kind, Elternteil sieht nur das eigene Kind", async ({
  page,
}) => {
  const suffix = Date.now();
  const childLastName = `E2EKind${suffix}`;
  const parentLastName = `E2EEltern${suffix}`;

  await page.goto("/personen");

  await page.getByLabel(/vorname der neuen person/i).fill("E2E");
  await page.getByLabel(/nachname der neuen person/i).fill(childLastName);
  await page.getByRole("button", { name: "Person anlegen" }).click();
  await expect(page.locator(`input[value="${childLastName}"]`)).toBeVisible();

  await page.getByLabel(/vorname der neuen person/i).fill("E2E");
  await page.getByLabel(/nachname der neuen person/i).fill(parentLastName);
  await page.getByRole("button", { name: "Person anlegen" }).click();
  const parentCard = page.locator("li").filter({ has: page.locator(`input[value="${parentLastName}"]`) });
  await expect(parentCard).toBeVisible();

  // "Beziehung hinzufügen" on the parent's card: select the child, type
  // Erziehungsberechtigter (LEGAL_GUARDIAN).
  await parentCard.getByLabel("Person auswählen").selectOption({ label: `E2E ${childLastName}` });
  await parentCard.getByLabel("Beziehungstyp").selectOption({ label: "Erziehungsberechtigter" });
  await parentCard.getByRole("button", { name: "Beziehung hinzufügen" }).click();
  await expect(parentCard.getByText(`Erziehungsberechtigter von E2E ${childLastName}`)).toBeVisible();

  // Resolve the parent's Person id directly (needed for the invitation
  // API call below — there is no person-detail URL in this app's UI).
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: PILOT_TENANT_SLUG } });
  const db = getTenantPrisma(tenant.id);
  const parentPerson = await db.person.findFirstOrThrow({
    where: { tenantId: tenant.id, firstName: "E2E", lastName: parentLastName },
  });

  const email = `e2e-guardian-${suffix}@example.invalid`;
  const inviteResponse = await page.request.post(
    `${API_URL}/api/v1/persons/${parentPerson.id}/invitations`,
    { headers: { "x-tenant-id": tenant.id }, data: { email } },
  );
  expect(inviteResponse.ok()).toBe(true);
  const invitation = (await inviteResponse.json()) as { token: string };

  // A fresh, unauthenticated context: the accept flow must work for a
  // brand-new visitor, not rely on the admin's still-active session.
  const guardianContext = await page.context().browser()!.newContext({ baseURL: APP_URL });
  const guardianPage = await guardianContext.newPage();
  await guardianPage.goto(`/einladung/${invitation.token}`);
  await expect(guardianPage.getByText(new RegExp(`Einladung zu`, "i"))).toBeVisible();

  await guardianPage.getByLabel("Dein Name").fill(`E2E ${parentLastName} Account`);
  await guardianPage.getByLabel("Passwort festlegen").fill("Sup3rSicher!Guardian");
  await guardianPage
    .getByRole("button", { name: "Konto erstellen und Einladung annehmen" })
    .click();
  await guardianPage.waitForURL("**/");

  await guardianPage.goto("/meine-kinder");
  await expect(guardianPage.getByText(`E2E ${childLastName}`)).toBeVisible();

  // Fremdes Kind nicht sichtbar: none of the tenant's other demo persons
  // (unrelated to this guardian) may appear on this page.
  await expect(guardianPage.getByText("Max Mustermann")).toHaveCount(0);
  await expect(guardianPage.getByText("Erika Musterfrau")).toHaveCount(0);
  await expect(guardianPage.getByText("Petra Beispiel")).toHaveCount(0);

  await guardianContext.close();
});
