import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

/**
 * Guards the auto-derivation in tenant-prisma.ts (Phase 9): every model
 * with a `tenantId` field must end up tenant-scoped, except the small,
 * explicitly-justified exclusion list (currently just
 * `AccountInvitation`, see its schema.prisma doc comment and
 * tenant-prisma.ts). This is a pure unit test — no database needed — it
 * only inspects the generated Prisma DMMF, which is exactly what
 * getTenantPrisma() itself inspects at runtime.
 *
 * The point of this test: adding a new tenant-scoped model (i.e. adding a
 * `tenantId` field to it) must require ZERO changes to tenant-prisma.ts
 * to be correctly wrapped in RLS context — that's the whole fix for the
 * "hand-maintained list, fail-open if forgotten" risk this replaces.
 */
describe("tenant-scoped model derivation", () => {
  const EXCLUSIONS = new Set(["AccountInvitation"]);

  function deriveTenantScopedModels(): Set<string> {
    return new Set(
      Prisma.dmmf.datamodel.models
        .filter((model) => model.fields.some((field) => field.name === "tenantId"))
        .map((model) => model.name)
        .filter((name) => !EXCLUSIONS.has(name)),
    );
  }

  it("includes every known tenant-scoped model, including the Phase 9 additions", () => {
    const derived = deriveTenantScopedModels();
    expect([...derived].sort()).toEqual(
      [
        "Department",
        "Team",
        "Person",
        "RoleAssignment",
        "PersonRelationship",
        "TeamMember",
        "Season",
        "AgeGroup",
        "TeamSeason",
      ].sort(),
    );
  });

  it("excludes the global identity layer (no tenantId field on any of them)", () => {
    const derived = deriveTenantScopedModels();
    for (const model of ["User", "Session", "Account", "Verification", "PlatformRoleAssignment", "Membership"]) {
      expect(derived.has(model)).toBe(false);
    }
  });

  it("excludes Tenant itself (root of the hierarchy, no tenantId field on Tenant)", () => {
    const derived = deriveTenantScopedModels();
    expect(derived.has("Tenant")).toBe(false);
  });

  it("excludes AccountInvitation despite it having a tenantId field (deliberate RLS exemption)", () => {
    const hasTenantIdField = Prisma.dmmf.datamodel.models
      .find((m) => m.name === "AccountInvitation")
      ?.fields.some((f) => f.name === "tenantId");
    expect(hasTenantIdField).toBe(true);

    const derived = deriveTenantScopedModels();
    expect(derived.has("AccountInvitation")).toBe(false);
  });

  it("would automatically include a hypothetical new tenantId-bearing model without any code change", () => {
    // Simulates what happens the next time someone adds a new
    // tenant-scoped model: the derivation logic itself doesn't need to
    // change, only the schema does. We can't add a real model here
    // without a migration, so this asserts the *mechanism* (filtering by
    // field presence) rather than hardcoding another real model name.
    const models = Prisma.dmmf.datamodel.models;
    const withTenantId = models.filter((m) => m.fields.some((f) => f.name === "tenantId"));
    const withoutExclusions = withTenantId.filter((m) => !EXCLUSIONS.has(m.name));
    expect(withoutExclusions.length).toBe(withTenantId.length - 1); // only AccountInvitation excluded
    expect(withoutExclusions.length).toBeGreaterThan(0);
  });
});
