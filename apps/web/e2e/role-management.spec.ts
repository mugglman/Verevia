import { expect, test } from "@playwright/test";

/**
 * Phase 5 happy path: TENANT_ADMIN creates a person, grants a role
 * (Trainer/E1), sees it take effect in the UI, then revokes it again.
 * Uses the default (TENANT_ADMIN) storageState from playwright.config.ts.
 * The full authorization-effect proof (does granting/revoking actually
 * change API access) lives in the more direct
 * apps/api/test/role-management.integration-spec.ts — this test covers
 * the UI mechanics (section 28), not re-proving authorization behavior.
 */
test("TENANT_ADMIN vergibt und entzieht eine Rolle über die Personenverwaltung", async ({ page }) => {
  const firstName = "E2E";
  const lastName = `RoleDemo ${Date.now()}`;

  await page.goto("/personen");
  await page.getByLabel(/vorname der neuen person/i).fill(firstName);
  await page.getByLabel(/nachname der neuen person/i).fill(lastName);
  await page.getByRole("button", { name: "Person anlegen" }).click();

  // TENANT_ADMIN sees each person's name as editable inputs (canEdit),
  // not plain text — locate the card via the lastName input's value
  // rather than text content.
  const personCard = page
    .locator("li")
    .filter({ has: page.locator(`input[value="${lastName}"]`) });
  await expect(personCard).toBeVisible();
  await expect(personCard.getByText(/keine rollen zugewiesen/i)).toBeVisible();

  await personCard.getByLabel("Rolle").selectOption({ label: "Trainer" });
  await personCard.getByLabel("Mannschaft auswählen").selectOption({ label: "E1" });
  await personCard.getByRole("button", { name: "Rolle hinzufügen" }).click();

  await expect(personCard.getByText("Trainer E1")).toBeVisible();

  await personCard.getByLabel("Trainer E1 entfernen").click();
  await expect(personCard.getByText("Trainer E1")).toHaveCount(0);
  await expect(personCard.getByText(/keine rollen zugewiesen/i)).toBeVisible();
});
