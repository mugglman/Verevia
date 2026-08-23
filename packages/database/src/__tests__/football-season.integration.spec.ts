import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for the Phase 9 football season foundation
 * (Season, AgeGroup, TeamSeason) — cross-tenant composite-FK rejection, the
 * date-range CHECK constraint, the "at most one ACTIVE Season per
 * Department" partial unique index, and RLS fail-closed behavior. Not part
 * of `pnpm test` (needs a real PostgreSQL instance), same reasoning as
 * rls.integration.spec.ts / cross-tenant-fk.integration.spec.ts. Run via
 * `pnpm test:integration`.
 */

const rawPrisma = new PrismaClient(); // uses DATABASE_URL — must be the restricted verevia_app role
const adminPrisma = createAdminPrismaForTests();

let tenantAId: string;
let tenantBId: string;
let departmentFootballAId: string;
let departmentFootballBId: string;
let teamE1AId: string;
let teamE1BId: string;
let seasonAId: string;
let ageGroupAId: string;

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({
    data: { name: "Football Season Test Tenant A", slug: `football-season-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Football Season Test Tenant B", slug: `football-season-b-${Date.now()}` },
  });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const departmentFootballA = await adminPrisma.department.create({
    data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" },
  });
  const departmentFootballB = await adminPrisma.department.create({
    data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" },
  });
  departmentFootballAId = departmentFootballA.id;
  departmentFootballBId = departmentFootballB.id;

  const teamE1A = await adminPrisma.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "E1" },
  });
  const teamE1B = await adminPrisma.team.create({
    data: { tenantId: tenantBId, departmentId: departmentFootballBId, name: "E1" },
  });
  teamE1AId = teamE1A.id;
  teamE1BId = teamE1B.id;

  const seasonA = await adminPrisma.season.create({
    data: {
      tenantId: tenantAId,
      departmentId: departmentFootballAId,
      name: "2026/2027",
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2027-06-30"),
      status: "ACTIVE",
    },
  });
  seasonAId = seasonA.id;

  const ageGroupA = await adminPrisma.ageGroup.create({
    data: { tenantId: tenantAId, name: "E-Jugend", sortOrder: 1 },
  });
  ageGroupAId = ageGroupA.id;
});

afterAll(async () => {
  await adminPrisma.teamSeason.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.ageGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.season.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("Cross-tenant FK consistency — Season → Department", () => {
  it("rejects a Season whose departmentId belongs to a different tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.season.create({
        data: {
          tenantId: tenantAId,
          departmentId: departmentFootballBId, // belongs to tenant B, not A
          name: "Cross-Tenant Season",
          startsAt: new Date("2026-08-01"),
          endsAt: new Date("2027-06-30"),
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts a Season whose departmentId belongs to the SAME tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    const season = await db.season.create({
      data: {
        tenantId: tenantAId,
        departmentId: departmentFootballAId,
        name: "Same-Tenant Season",
        startsAt: new Date("2027-08-01"),
        endsAt: new Date("2028-06-30"),
      },
    });
    expect(season.departmentId).toBe(departmentFootballAId);
    await adminPrisma.season.delete({ where: { id: season.id } });
  });
});

describe("Season date-range CHECK constraint", () => {
  it("rejects a Season where startsAt is not before endsAt", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.season.create({
        data: {
          tenantId: tenantAId,
          departmentId: departmentFootballAId,
          name: "Invalid Range",
          startsAt: new Date("2027-06-30"),
          endsAt: new Date("2026-08-01"),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("Season — at most one ACTIVE season per department (partial unique index)", () => {
  it("rejects a second ACTIVE season for a department that already has one", async () => {
    // seasonA (fixture) is already ACTIVE for departmentFootballAId.
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.season.create({
        data: {
          tenantId: tenantAId,
          departmentId: departmentFootballAId,
          name: "Second Active Season",
          startsAt: new Date("2028-08-01"),
          endsAt: new Date("2029-06-30"),
          status: "ACTIVE",
        },
      }),
    ).rejects.toThrow();
  });

  it("allows a second PLANNED season for the same department", async () => {
    const db = getTenantPrisma(tenantAId);
    const season = await db.season.create({
      data: {
        tenantId: tenantAId,
        departmentId: departmentFootballAId,
        name: "Planned Season",
        startsAt: new Date("2028-08-01"),
        endsAt: new Date("2029-06-30"),
        status: "PLANNED",
      },
    });
    expect(season.status).toBe("PLANNED");
    await adminPrisma.season.delete({ where: { id: season.id } });
  });
});

describe("Cross-tenant FK consistency — TeamSeason → Team/Season/AgeGroup", () => {
  it("rejects a TeamSeason with tenantId=A but teamId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.teamSeason.create({
        data: {
          tenantId: tenantAId,
          teamId: teamE1BId,
          seasonId: seasonAId,
          ageGroupId: ageGroupAId,
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts a TeamSeason where team, season and age group all belong to the SAME tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    const teamSeason = await db.teamSeason.create({
      data: {
        tenantId: tenantAId,
        teamId: teamE1AId,
        seasonId: seasonAId,
        ageGroupId: ageGroupAId,
      },
    });
    expect(teamSeason.teamId).toBe(teamE1AId);
    await adminPrisma.teamSeason.delete({ where: { id: teamSeason.id } });
  });

  it("rejects a second TeamSeason for the same team/season pair (@@unique)", async () => {
    const db = getTenantPrisma(tenantAId);
    const first = await db.teamSeason.create({
      data: { tenantId: tenantAId, teamId: teamE1AId, seasonId: seasonAId, ageGroupId: ageGroupAId },
    });
    await expect(
      db.teamSeason.create({
        data: { tenantId: tenantAId, teamId: teamE1AId, seasonId: seasonAId, ageGroupId: ageGroupAId },
      }),
    ).rejects.toThrow();
    await adminPrisma.teamSeason.delete({ where: { id: first.id } });
  });
});

describe("PostgreSQL RLS — fail-closed without tenant context (Season/AgeGroup/TeamSeason)", () => {
  it("a connection with no app.tenant_id set sees NO Season rows", async () => {
    const seasons = await rawPrisma.season.findMany({ where: { id: seasonAId } });
    expect(seasons).toHaveLength(0);
  });

  it("a connection with no app.tenant_id set sees NO AgeGroup rows", async () => {
    const ageGroups = await rawPrisma.ageGroup.findMany({ where: { id: ageGroupAId } });
    expect(ageGroups).toHaveLength(0);
  });

  it("a connection with no app.tenant_id set sees NO TeamSeason rows", async () => {
    const db = getTenantPrisma(tenantAId);
    const teamSeason = await db.teamSeason.create({
      data: { tenantId: tenantAId, teamId: teamE1AId, seasonId: seasonAId, ageGroupId: ageGroupAId },
    });
    const teamSeasons = await rawPrisma.teamSeason.findMany({ where: { id: teamSeason.id } });
    expect(teamSeasons).toHaveLength(0);
    await adminPrisma.teamSeason.delete({ where: { id: teamSeason.id } });
  });
});

describe("PostgreSQL RLS — tenant isolation (Season)", () => {
  it("Tenant B does NOT see Tenant A's Season", async () => {
    const db = getTenantPrisma(tenantBId);
    const season = await db.season.findUnique({ where: { id: seasonAId } });
    expect(season).toBeNull();
  });

  it("Tenant B cannot update Tenant A's Season", async () => {
    const db = getTenantPrisma(tenantBId);
    await expect(
      db.season.update({ where: { id: seasonAId }, data: { status: "COMPLETED" } }),
    ).rejects.toThrow();

    const dbA = getTenantPrisma(tenantAId);
    const stillActive = await dbA.season.findUnique({ where: { id: seasonAId } });
    expect(stillActive?.status).toBe("ACTIVE");
  });
});

describe("AgeGroup uniqueness per tenant", () => {
  it("rejects a duplicate AgeGroup name within the same tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.ageGroup.create({ data: { tenantId: tenantAId, name: "E-Jugend", sortOrder: 2 } }),
    ).rejects.toThrow();
  });

  it("allows the same AgeGroup name in a DIFFERENT tenant", async () => {
    const db = getTenantPrisma(tenantBId);
    const ageGroup = await db.ageGroup.create({
      data: { tenantId: tenantBId, name: "E-Jugend", sortOrder: 1 },
    });
    expect(ageGroup.name).toBe("E-Jugend");
    await adminPrisma.ageGroup.delete({ where: { id: ageGroup.id } });
  });
});
