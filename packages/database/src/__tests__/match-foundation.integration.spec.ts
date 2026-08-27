import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for the Phase 10 venue/match foundation
 * (Venue, FootballMatch) — cross-tenant composite-FK rejection, the
 * result-requires-COMPLETED CHECK constraint, and RLS fail-closed
 * behavior. Not part of `pnpm test` (needs a real PostgreSQL instance),
 * same reasoning as football-season.integration.spec.ts. Run via
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
let seasonBId: string;
let ageGroupAId: string;
let ageGroupBId: string;
let teamSeasonAId: string;
let teamSeasonBId: string;
let venueAId: string;
let venueBId: string;

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({
    data: { name: "Match Foundation Test Tenant A", slug: `match-foundation-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Match Foundation Test Tenant B", slug: `match-foundation-b-${Date.now()}` },
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
  const seasonB = await adminPrisma.season.create({
    data: {
      tenantId: tenantBId,
      departmentId: departmentFootballBId,
      name: "2026/2027",
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2027-06-30"),
      status: "ACTIVE",
    },
  });
  seasonAId = seasonA.id;
  seasonBId = seasonB.id;

  const ageGroupA = await adminPrisma.ageGroup.create({
    data: { tenantId: tenantAId, name: "E-Jugend", sortOrder: 1 },
  });
  const ageGroupB = await adminPrisma.ageGroup.create({
    data: { tenantId: tenantBId, name: "E-Jugend", sortOrder: 1 },
  });
  ageGroupAId = ageGroupA.id;
  ageGroupBId = ageGroupB.id;

  const teamSeasonA = await adminPrisma.teamSeason.create({
    data: { tenantId: tenantAId, teamId: teamE1AId, seasonId: seasonAId, ageGroupId: ageGroupAId },
  });
  const teamSeasonB = await adminPrisma.teamSeason.create({
    data: { tenantId: tenantBId, teamId: teamE1BId, seasonId: seasonBId, ageGroupId: ageGroupBId },
  });
  teamSeasonAId = teamSeasonA.id;
  teamSeasonBId = teamSeasonB.id;

  const venueA = await adminPrisma.venue.create({
    data: { tenantId: tenantAId, name: "Sportplatz A" },
  });
  const venueB = await adminPrisma.venue.create({
    data: { tenantId: tenantBId, name: "Sportplatz B" },
  });
  venueAId = venueA.id;
  venueBId = venueB.id;
});

afterAll(async () => {
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.venue.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.teamSeason.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.ageGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.season.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("Venue — tenant isolation", () => {
  it("Tenant A creates its own Venue", async () => {
    const db = getTenantPrisma(tenantAId);
    const venue = await db.venue.create({ data: { tenantId: tenantAId, name: "Zweiter Platz A" } });
    expect(venue.tenantId).toBe(tenantAId);
    await adminPrisma.venue.delete({ where: { id: venue.id } });
  });

  it("Tenant B does NOT see Tenant A's Venue", async () => {
    const db = getTenantPrisma(tenantBId);
    const venue = await db.venue.findUnique({ where: { id: venueAId } });
    expect(venue).toBeNull();
  });

  it("a connection with no app.tenant_id set sees NO Venue rows", async () => {
    const venues = await rawPrisma.venue.findMany({ where: { id: { in: [venueAId, venueBId] } } });
    expect(venues).toHaveLength(0);
  });
});

describe("Cross-tenant FK consistency — FootballMatch → TeamSeason/Venue", () => {
  it("accepts a Match where TeamSeason and Venue both belong to the SAME tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: {
        tenantId: tenantAId,
        teamSeasonId: teamSeasonAId,
        venueId: venueAId,
        startsAt: new Date("2026-09-12T08:00:00.000Z"),
        type: "FRIENDLY",
        homeAway: "HOME",
        opponentName: "Test-Gegner",
      },
    });
    expect(match.teamSeasonId).toBe(teamSeasonAId);
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("rejects a Match with tenantId=A but teamSeasonId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballMatch.create({
        data: {
          tenantId: tenantAId,
          teamSeasonId: teamSeasonBId,
          startsAt: new Date("2026-09-12T08:00:00.000Z"),
          type: "FRIENDLY",
          homeAway: "HOME",
          opponentName: "Test-Gegner",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a Match with tenantId=A but venueId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballMatch.create({
        data: {
          tenantId: tenantAId,
          teamSeasonId: teamSeasonAId,
          venueId: venueBId,
          startsAt: new Date("2026-09-12T08:00:00.000Z"),
          type: "FRIENDLY",
          homeAway: "HOME",
          opponentName: "Test-Gegner",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("FootballMatch — result requires COMPLETED status (CHECK constraint)", () => {
  it("rejects a SCHEDULED match with a homeScore/awayScore set", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballMatch.create({
        data: {
          tenantId: tenantAId,
          teamSeasonId: teamSeasonAId,
          startsAt: new Date("2026-09-12T08:00:00.000Z"),
          type: "LEAGUE",
          status: "SCHEDULED",
          homeAway: "HOME",
          opponentName: "Test-Gegner",
          homeScore: 1,
          awayScore: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts a COMPLETED match with a result", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: {
        tenantId: tenantAId,
        teamSeasonId: teamSeasonAId,
        startsAt: new Date("2026-08-15T14:00:00.000Z"),
        type: "LEAGUE",
        status: "COMPLETED",
        homeAway: "HOME",
        opponentName: "Test-Gegner",
        homeScore: 3,
        awayScore: 1,
      },
    });
    expect(match.homeScore).toBe(3);
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("accepts a SCHEDULED match with no result", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: {
        tenantId: tenantAId,
        teamSeasonId: teamSeasonAId,
        startsAt: new Date("2026-09-12T08:00:00.000Z"),
        type: "FRIENDLY",
        homeAway: "HOME",
        opponentName: "Test-Gegner",
      },
    });
    expect(match.homeScore).toBeNull();
    expect(match.awayScore).toBeNull();
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });
});

describe("PostgreSQL RLS — tenant isolation (FootballMatch)", () => {
  it("Tenant B does NOT see Tenant A's Match", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const match = await dbA.footballMatch.create({
      data: {
        tenantId: tenantAId,
        teamSeasonId: teamSeasonAId,
        startsAt: new Date("2026-09-12T08:00:00.000Z"),
        type: "FRIENDLY",
        homeAway: "HOME",
        opponentName: "Test-Gegner",
      },
    });

    const dbB = getTenantPrisma(tenantBId);
    const seenByB = await dbB.footballMatch.findUnique({ where: { id: match.id } });
    expect(seenByB).toBeNull();

    const rawSeen = await rawPrisma.footballMatch.findUnique({ where: { id: match.id } });
    expect(rawSeen).toBeNull();

    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("Tenant B cannot update Tenant A's Match", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const match = await dbA.footballMatch.create({
      data: {
        tenantId: tenantAId,
        teamSeasonId: teamSeasonAId,
        startsAt: new Date("2026-09-12T08:00:00.000Z"),
        type: "FRIENDLY",
        homeAway: "HOME",
        opponentName: "Test-Gegner",
      },
    });

    const dbB = getTenantPrisma(tenantBId);
    await expect(
      dbB.footballMatch.update({ where: { id: match.id }, data: { opponentName: "Hijacked" } }),
    ).rejects.toThrow();

    const stillA = await dbA.footballMatch.findUnique({ where: { id: match.id } });
    expect(stillA?.opponentName).toBe("Test-Gegner");

    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });
});
