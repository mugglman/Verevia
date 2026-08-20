import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * Real PostgreSQL RLS integration tests, per docs/ARCHITEKTUR_FINALISIERUNG.md
 * section 8 and the Phase 2 work order, section 21 ("KRITISCH").
 *
 * These tests exercise the actual PostgreSQL row-level-security policies
 * from prisma/migrations/20260817150231_add_rls_and_scope_constraint —
 * NOT just Prisma-level `where` filters. They run against a real database
 * (DATABASE_URL must point at the restricted, non-superuser `verevia_app`
 * role for RLS to have any effect at all — see
 * prisma/migrations/20260817150935_add_non_superuser_app_role) and are
 * therefore intentionally NOT part of the default `pnpm test` run (no
 * PostgreSQL instance is available in the standard quality-gate/CI
 * environment yet). Run explicitly via `pnpm test:integration` against a
 * reachable PostgreSQL 17 instance.
 */

const rawPrisma = new PrismaClient(); // uses DATABASE_URL — must be the restricted verevia_app role
const adminPrisma = createAdminPrismaForTests(); // superuser — fixture setup/teardown only, bypasses RLS

let tenantAId: string;
let tenantBId: string;
let personAId: string;
let personBId: string;
let teamAId: string;
let teamBId: string;
let teamMemberAId: string;
let teamMemberBId: string;

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({
    data: { name: "RLS Test Tenant A", slug: `rls-test-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "RLS Test Tenant B", slug: `rls-test-b-${Date.now()}` },
  });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const personA = await adminPrisma.person.create({
    data: { tenantId: tenantAId, firstName: "Person", lastName: "A" },
  });
  const personB = await adminPrisma.person.create({
    data: { tenantId: tenantBId, firstName: "Person", lastName: "B" },
  });
  personAId = personA.id;
  personBId = personB.id;

  const departmentA = await adminPrisma.department.create({
    data: { tenantId: tenantAId, name: "Department A" },
  });
  const departmentB = await adminPrisma.department.create({
    data: { tenantId: tenantBId, name: "Department B" },
  });

  const teamA = await adminPrisma.team.create({
    data: { tenantId: tenantAId, departmentId: departmentA.id, name: "Team A" },
  });
  const teamB = await adminPrisma.team.create({
    data: { tenantId: tenantBId, departmentId: departmentB.id, name: "Team B" },
  });
  teamAId = teamA.id;
  teamBId = teamB.id;

  const teamMemberA = await adminPrisma.teamMember.create({
    data: { tenantId: tenantAId, personId: personAId, teamId: teamAId },
  });
  const teamMemberB = await adminPrisma.teamMember.create({
    data: { tenantId: tenantBId, personId: personBId, teamId: teamBId },
  });
  teamMemberAId = teamMemberA.id;
  teamMemberBId = teamMemberB.id;
});

afterAll(async () => {
  await adminPrisma.teamMember.deleteMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
  });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
  });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("PostgreSQL RLS — tenant isolation (Person)", () => {
  it("Tenant A sees Person A", async () => {
    const db = getTenantPrisma(tenantAId);
    const person = await db.person.findUnique({ where: { id: personAId } });
    expect(person).not.toBeNull();
    expect(person?.id).toBe(personAId);
  });

  it("Tenant A does NOT see Person B", async () => {
    const db = getTenantPrisma(tenantAId);
    const person = await db.person.findUnique({ where: { id: personBId } });
    expect(person).toBeNull();
  });

  it("Tenant B sees Person B", async () => {
    const db = getTenantPrisma(tenantBId);
    const person = await db.person.findUnique({ where: { id: personBId } });
    expect(person).not.toBeNull();
    expect(person?.id).toBe(personBId);
  });

  it("Tenant B does NOT see Person A", async () => {
    const db = getTenantPrisma(tenantBId);
    const person = await db.person.findUnique({ where: { id: personAId } });
    expect(person).toBeNull();
  });

  it("findMany() scoped to Tenant A returns exactly Tenant A's rows", async () => {
    const db = getTenantPrisma(tenantAId);
    const persons = await db.person.findMany({
      where: { id: { in: [personAId, personBId] } },
    });
    expect(persons.map((p) => p.id)).toEqual([personAId]);
  });
});

describe("PostgreSQL RLS — fail-closed without tenant context", () => {
  it("a connection with no app.tenant_id set sees NO tenant-bound rows", async () => {
    const persons = await rawPrisma.person.findMany({
      where: { id: { in: [personAId, personBId] } },
    });
    expect(persons).toHaveLength(0);
  });
});

describe("PostgreSQL RLS — cross-tenant write protection", () => {
  it("INSERT with a tenantId that does not match the active context is rejected", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.person.create({
        data: { tenantId: tenantBId, firstName: "Should", lastName: "Fail" },
      }),
    ).rejects.toThrow();
  });

  it("UPDATE across tenants affects no row (Tenant A cannot update Person B)", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.person.update({
        where: { id: personBId },
        data: { lastName: "Hijacked" },
      }),
    ).rejects.toThrow();

    // Person B is unchanged when read back by its own tenant.
    const dbB = getTenantPrisma(tenantBId);
    const stillB = await dbB.person.findUnique({ where: { id: personBId } });
    expect(stillB?.lastName).toBe("B");
  });

  it("DELETE across tenants affects no row (Tenant B cannot delete Person A)", async () => {
    const db = getTenantPrisma(tenantBId);
    await expect(db.person.delete({ where: { id: personAId } })).rejects.toThrow();

    // Person A still exists when read back by its own tenant.
    const dbA = getTenantPrisma(tenantAId);
    const stillA = await dbA.person.findUnique({ where: { id: personAId } });
    expect(stillA).not.toBeNull();
  });
});

describe("RoleAssignment scope CHECK constraint", () => {
  it("rejects TEAM scope without teamId", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.roleAssignment.create({
        data: {
          tenantId: tenantAId,
          personId: personAId,
          role: "MEMBER",
          scopeType: "TEAM",
          // teamId intentionally omitted — must violate the CHECK constraint
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects TENANT scope with a departmentId set", async () => {
    await expect(
      adminPrisma.$executeRaw`
        INSERT INTO "role_assignment" (id, "tenantId", "personId", role, "scopeType", "departmentId", "createdAt")
        VALUES (gen_random_uuid()::text, ${tenantAId}, ${personAId}, 'MEMBER', 'TENANT', gen_random_uuid()::text, now())
      `,
    ).rejects.toThrow();
  });

  it("accepts a valid TENANT-scope RoleAssignment", async () => {
    const db = getTenantPrisma(tenantAId);
    const assignment = await db.roleAssignment.create({
      data: {
        tenantId: tenantAId,
        personId: personAId,
        role: "MEMBER",
        scopeType: "TENANT",
      },
    });
    expect(assignment.scopeType).toBe("TENANT");

    await adminPrisma.roleAssignment.delete({ where: { id: assignment.id } });
  });
});

describe("PostgreSQL RLS — tenant isolation (TeamMember)", () => {
  it("Tenant A sees its own TeamMember", async () => {
    const db = getTenantPrisma(tenantAId);
    const member = await db.teamMember.findUnique({ where: { id: teamMemberAId } });
    expect(member).not.toBeNull();
    expect(member?.id).toBe(teamMemberAId);
  });

  it("Tenant A does NOT see Tenant B's TeamMember", async () => {
    const db = getTenantPrisma(tenantAId);
    const member = await db.teamMember.findUnique({ where: { id: teamMemberBId } });
    expect(member).toBeNull();
  });

  it("a connection with no app.tenant_id set sees NO TeamMember rows", async () => {
    const members = await rawPrisma.teamMember.findMany({
      where: { id: { in: [teamMemberAId, teamMemberBId] } },
    });
    expect(members).toHaveLength(0);
  });

  it("findMany() scoped to Tenant A returns exactly Tenant A's TeamMember rows", async () => {
    const db = getTenantPrisma(tenantAId);
    const members = await db.teamMember.findMany({
      where: { id: { in: [teamMemberAId, teamMemberBId] } },
    });
    expect(members.map((m) => m.id)).toEqual([teamMemberAId]);
  });

  it("Tenant B cannot update Tenant A's TeamMember", async () => {
    const db = getTenantPrisma(tenantBId);
    await expect(
      db.teamMember.update({ where: { id: teamMemberAId }, data: { status: "INACTIVE" } }),
    ).rejects.toThrow();

    const dbA = getTenantPrisma(tenantAId);
    const stillActive = await dbA.teamMember.findUnique({ where: { id: teamMemberAId } });
    expect(stillActive?.status).toBe("ACTIVE");
  });
});

describe("RoleAssignment uniqueness (migration 20260820142846_add_role_assignment_uniqueness)", () => {
  it("rejects an identical duplicate TEAM-scope RoleAssignment (same person/role/team)", async () => {
    const db = getTenantPrisma(tenantAId);
    const first = await db.roleAssignment.create({
      data: { tenantId: tenantAId, personId: personAId, role: "COACH", scopeType: "TEAM", teamId: teamAId },
    });
    await expect(
      db.roleAssignment.create({
        data: { tenantId: tenantAId, personId: personAId, role: "COACH", scopeType: "TEAM", teamId: teamAId },
      }),
    ).rejects.toThrow();
    await adminPrisma.roleAssignment.delete({ where: { id: first.id } });
  });

  it("rejects an identical duplicate TENANT-scope RoleAssignment (both departmentId/teamId NULL)", async () => {
    const db = getTenantPrisma(tenantAId);
    const first = await db.roleAssignment.create({
      data: { tenantId: tenantAId, personId: personAId, role: "TENANT_ADMIN", scopeType: "TENANT" },
    });
    await expect(
      db.roleAssignment.create({
        data: { tenantId: tenantAId, personId: personAId, role: "TENANT_ADMIN", scopeType: "TENANT" },
      }),
    ).rejects.toThrow();
    await adminPrisma.roleAssignment.delete({ where: { id: first.id } });
  });

  it("allows the same role for the same person in two DIFFERENT teams", async () => {
    const db = getTenantPrisma(tenantAId);
    const other = await adminPrisma.team.create({
      data: { tenantId: tenantAId, departmentId: (await adminPrisma.team.findUniqueOrThrow({ where: { id: teamAId } })).departmentId, name: "Team A2" },
    });
    const first = await db.roleAssignment.create({
      data: { tenantId: tenantAId, personId: personAId, role: "COACH", scopeType: "TEAM", teamId: teamAId },
    });
    const second = await db.roleAssignment.create({
      data: { tenantId: tenantAId, personId: personAId, role: "COACH", scopeType: "TEAM", teamId: other.id },
    });
    expect(second.teamId).toBe(other.id);
    await adminPrisma.roleAssignment.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    await adminPrisma.team.delete({ where: { id: other.id } });
  });
});
