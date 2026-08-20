import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * Cross-tenant referential-integrity tests for the composite foreign keys
 * added in migration `20260820080847_add_cross_tenant_fk_consistency` — see
 * docs/PHASE_3_CORE_HARDENING_REPORT.md. Not part of `pnpm test` (needs a
 * real PostgreSQL instance), same reasoning as rls.integration.spec.ts. Run
 * via `pnpm test:integration`.
 *
 * These verify what RLS alone does NOT: that `team.departmentId` and
 * `role_assignment.departmentId`/`teamId` cannot reference a Department/Team
 * belonging to a DIFFERENT tenant than the referencing row's own `tenantId`
 * — a real, negative-tested constraint at the database level, not just an
 * application-level convention.
 */

const adminPrisma = createAdminPrismaForTests();

let tenantAId: string;
let tenantBId: string;
let departmentAId: string;
let departmentBId: string;
let teamAId: string;
let teamBId: string;
let personAId: string;
let personBId: string;

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({
    data: { name: "FK Test Tenant A", slug: `fk-test-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "FK Test Tenant B", slug: `fk-test-b-${Date.now()}` },
  });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const departmentA = await adminPrisma.department.create({
    data: { tenantId: tenantAId, name: "Department A" },
  });
  const departmentB = await adminPrisma.department.create({
    data: { tenantId: tenantBId, name: "Department B" },
  });
  departmentAId = departmentA.id;
  departmentBId = departmentB.id;

  const teamA = await adminPrisma.team.create({
    data: { tenantId: tenantAId, departmentId: departmentAId, name: "Team A" },
  });
  const teamB = await adminPrisma.team.create({
    data: { tenantId: tenantBId, departmentId: departmentBId, name: "Team B" },
  });
  teamAId = teamA.id;
  teamBId = teamB.id;

  const personA = await adminPrisma.person.create({
    data: { tenantId: tenantAId, firstName: "Person", lastName: "A" },
  });
  personAId = personA.id;

  const personB = await adminPrisma.person.create({
    data: { tenantId: tenantBId, firstName: "Person", lastName: "B" },
  });
  personBId = personB.id;
});

afterAll(async () => {
  await adminPrisma.teamMember.deleteMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
  });
  await adminPrisma.roleAssignment.deleteMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
  });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
  });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
});

describe("Cross-tenant FK consistency — Team → Department", () => {
  it("rejects a Team whose departmentId belongs to a different tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.team.create({
        data: { tenantId: tenantAId, departmentId: departmentBId, name: "Cross-Tenant Team" },
      }),
    ).rejects.toThrow();
  });

  it("accepts a Team whose departmentId belongs to the SAME tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    const team = await db.team.create({
      data: { tenantId: tenantAId, departmentId: departmentAId, name: "Same-Tenant Team" },
    });
    expect(team.departmentId).toBe(departmentAId);
    await adminPrisma.team.delete({ where: { id: team.id } });
  });
});

describe("Cross-tenant FK consistency — RoleAssignment → Department", () => {
  it("rejects a DEPARTMENT-scope RoleAssignment referencing another tenant's Department", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.roleAssignment.create({
        data: {
          tenantId: tenantAId,
          personId: personAId,
          role: "DEPARTMENT_ADMIN",
          scopeType: "DEPARTMENT",
          departmentId: departmentBId, // belongs to tenant B, not A
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts a DEPARTMENT-scope RoleAssignment referencing the SAME tenant's Department", async () => {
    const db = getTenantPrisma(tenantAId);
    const assignment = await db.roleAssignment.create({
      data: {
        tenantId: tenantAId,
        personId: personAId,
        role: "DEPARTMENT_ADMIN",
        scopeType: "DEPARTMENT",
        departmentId: departmentAId,
      },
    });
    expect(assignment.departmentId).toBe(departmentAId);
    await adminPrisma.roleAssignment.delete({ where: { id: assignment.id } });
  });
});

describe("Cross-tenant FK consistency — RoleAssignment → Team", () => {
  it("rejects a TEAM-scope RoleAssignment referencing another tenant's Team", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.roleAssignment.create({
        data: {
          tenantId: tenantAId,
          personId: personAId,
          role: "COACH",
          scopeType: "TEAM",
          teamId: teamBId, // belongs to tenant B, not A
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts a TEAM-scope RoleAssignment referencing the SAME tenant's Team", async () => {
    const db = getTenantPrisma(tenantAId);
    const assignment = await db.roleAssignment.create({
      data: {
        tenantId: tenantAId,
        personId: personAId,
        role: "COACH",
        scopeType: "TEAM",
        teamId: teamAId,
      },
    });
    expect(assignment.teamId).toBe(teamAId);
    await adminPrisma.roleAssignment.delete({ where: { id: assignment.id } });
  });
});

describe("Cross-tenant FK consistency — TeamMember → Person/Team", () => {
  it("accepts a TeamMember where Person and Team both belong to the SAME tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    const member = await db.teamMember.create({
      data: { tenantId: tenantAId, personId: personAId, teamId: teamAId },
    });
    expect(member.personId).toBe(personAId);
    expect(member.teamId).toBe(teamAId);
    await adminPrisma.teamMember.delete({ where: { id: member.id } });
  });

  it("rejects a TeamMember with tenantId=A but personId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.teamMember.create({
        data: { tenantId: tenantAId, personId: personBId, teamId: teamAId },
      }),
    ).rejects.toThrow();
  });

  it("rejects a TeamMember with tenantId=A but teamId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.teamMember.create({
        data: { tenantId: tenantAId, personId: personAId, teamId: teamBId },
      }),
    ).rejects.toThrow();
  });
});

describe("TeamMember — no duplicate active assignment", () => {
  it("rejects a second ACTIVE TeamMember for the same Person/Team pair", async () => {
    const db = getTenantPrisma(tenantAId);
    const first = await db.teamMember.create({
      data: { tenantId: tenantAId, personId: personAId, teamId: teamAId },
    });
    await expect(
      db.teamMember.create({
        data: { tenantId: tenantAId, personId: personAId, teamId: teamAId },
      }),
    ).rejects.toThrow();
    await adminPrisma.teamMember.delete({ where: { id: first.id } });
  });

  it("allows a new ACTIVE TeamMember after the previous one was deactivated", async () => {
    const db = getTenantPrisma(tenantAId);
    const first = await db.teamMember.create({
      data: { tenantId: tenantAId, personId: personAId, teamId: teamAId, status: "INACTIVE" },
    });
    const second = await db.teamMember.create({
      data: { tenantId: tenantAId, personId: personAId, teamId: teamAId },
    });
    expect(second.status).toBe("ACTIVE");
    await adminPrisma.teamMember.deleteMany({ where: { id: { in: [first.id, second.id] } } });
  });
});
