import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for the Phase 21 statistics query patterns —
 * NOT a new table/RLS policy (Statistics computes derived data from
 * `FootballMatch`/`Event`/`Attendance`, all already RLS-protected), but the
 * exact aggregation-relevant queries `StatisticsService` runs
 * (`footballMatch` by `teamSeasonId`+`status`, correct relation exclusion,
 * empty result sets) are verified here for tenant isolation and
 * correctness. Not part of `pnpm test` (needs a real PostgreSQL instance).
 * Run via `pnpm test:integration`.
 */

const rawPrisma = new PrismaClient();
const adminPrisma = createAdminPrismaForTests();

let tenantAId: string;
let tenantBId: string;
let departmentAId: string;
let teamAId: string;
let seasonAId: string;
let ageGroupAId: string;
let teamSeasonAId: string;
let teamSeasonBId: string; // a SECOND team season within tenant A, to verify exclusion
let teamBId: string;

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({ data: { name: "Statistics Test Tenant A", slug: `stats-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Statistics Test Tenant B", slug: `stats-b-${Date.now()}` } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const departmentA = await adminPrisma.department.create({ data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" } });
  departmentAId = departmentA.id;
  const departmentB = await adminPrisma.department.create({ data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" } });

  const teamA = await adminPrisma.team.create({ data: { tenantId: tenantAId, departmentId: departmentAId, name: "E1" } });
  teamAId = teamA.id;
  const teamA2 = await adminPrisma.team.create({ data: { tenantId: tenantAId, departmentId: departmentAId, name: "E2" } });
  teamBId = teamA2.id;
  const teamB = await adminPrisma.team.create({ data: { tenantId: tenantBId, departmentId: departmentB.id, name: "E1" } });

  const seasonA = await adminPrisma.season.create({
    data: { tenantId: tenantAId, departmentId: departmentAId, name: "2026/2027", startsAt: new Date("2026-08-01"), endsAt: new Date("2027-06-30"), status: "ACTIVE" },
  });
  seasonAId = seasonA.id;
  const ageGroupA = await adminPrisma.ageGroup.create({ data: { tenantId: tenantAId, name: "E-Jugend", sortOrder: 1 } });
  ageGroupAId = ageGroupA.id;

  const teamSeasonA = await adminPrisma.teamSeason.create({
    data: { tenantId: tenantAId, teamId: teamAId, seasonId: seasonAId, ageGroupId: ageGroupAId },
  });
  teamSeasonAId = teamSeasonA.id;
  const teamSeasonA2 = await adminPrisma.teamSeason.create({
    data: { tenantId: tenantAId, teamId: teamBId, seasonId: seasonAId, ageGroupId: ageGroupAId },
  });
  teamSeasonBId = teamSeasonA2.id;

  const seasonB = await adminPrisma.season.create({
    data: { tenantId: tenantBId, departmentId: departmentB.id, name: "2026/2027", startsAt: new Date("2026-08-01"), endsAt: new Date("2027-06-30"), status: "ACTIVE" },
  });
  const ageGroupB = await adminPrisma.ageGroup.create({ data: { tenantId: tenantBId, name: "E-Jugend", sortOrder: 1 } });
  const teamSeasonB = await adminPrisma.teamSeason.create({
    data: { tenantId: tenantBId, teamId: teamB.id, seasonId: seasonB.id, ageGroupId: ageGroupB.id },
  });

  // Ein abgeschlossenes Match je Tenant/TeamSeason — identische Scores, um
  // sicherzustellen, dass ein etwaiger Cross-Tenant-Leak nicht zufällig
  // durch unterschiedliche Werte auffiele, sondern durch die Zeilenzahl.
  await adminPrisma.footballMatch.create({
    data: { tenantId: tenantAId, teamSeasonId: teamSeasonAId, opponentName: "SV Testhausen", startsAt: new Date("2026-09-01T10:00:00Z"), type: "FRIENDLY", homeAway: "HOME", status: "COMPLETED", homeScore: 3, awayScore: 1 },
  });
  await adminPrisma.footballMatch.create({
    data: { tenantId: tenantAId, teamSeasonId: teamSeasonBId, opponentName: "SV Anderestadt", startsAt: new Date("2026-09-02T10:00:00Z"), type: "FRIENDLY", homeAway: "HOME", status: "COMPLETED", homeScore: 9, awayScore: 9 },
  });
  await adminPrisma.footballMatch.create({
    data: { tenantId: tenantBId, teamSeasonId: teamSeasonB.id, opponentName: "SV Testhausen", startsAt: new Date("2026-09-01T10:00:00Z"), type: "FRIENDLY", homeAway: "HOME", status: "COMPLETED", homeScore: 3, awayScore: 1 },
  });
});

afterAll(async () => {
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.teamSeason.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.ageGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.season.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("Statistics aggregation query — korrekte Relation TeamSeason → FootballMatch", () => {
  it("liefert ausschließlich Matches der angefragten teamSeasonId, nicht die einer anderen TeamSeason desselben Tenants", async () => {
    const db = getTenantPrisma(tenantAId);
    const matches = await db.footballMatch.findMany({ where: { teamSeasonId: teamSeasonAId, status: "COMPLETED" } });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.homeScore).toBe(3);
    expect(matches[0]?.awayScore).toBe(1);
  });

  it("liefert ein leeres Ergebnis für eine TeamSeason ohne abgeschlossene Matches", async () => {
    // Eigenes drittes Team statt teamAId/teamBId — TeamSeason trägt ein
    // Unique(teamId, seasonId), teamAId/teamBId haben in dieser Suite
    // bereits je eine TeamSeason für seasonAId.
    const db = getTenantPrisma(tenantAId);
    const teamC = await adminPrisma.team.create({ data: { tenantId: tenantAId, departmentId: departmentAId, name: "E3" } });
    const emptyTeamSeason = await db.teamSeason.create({
      data: { tenantId: tenantAId, teamId: teamC.id, seasonId: seasonAId, ageGroupId: ageGroupAId, displayName: "Ohne Spiele" },
    });
    const matches = await db.footballMatch.findMany({ where: { teamSeasonId: emptyTeamSeason.id, status: "COMPLETED" } });
    expect(matches).toHaveLength(0);
    await adminPrisma.teamSeason.delete({ where: { id: emptyTeamSeason.id } });
    await adminPrisma.team.delete({ where: { id: teamC.id } });
  });
});

describe("Statistics aggregation query — PostgreSQL RLS Tenant-Isolation", () => {
  it("Tenant B sieht über dieselbe Query-Struktur keine Matches von Tenant A", async () => {
    const dbB = getTenantPrisma(tenantBId);
    const matches = await dbB.footballMatch.findMany({ where: { teamSeasonId: teamSeasonAId, status: "COMPLETED" } });
    expect(matches).toHaveLength(0);
  });

  it("eine Verbindung ohne app.tenant_id sieht keine Matches (fail-closed)", async () => {
    const matches = await rawPrisma.footballMatch.findMany({ where: { teamSeasonId: teamSeasonAId, status: "COMPLETED" } });
    expect(matches).toHaveLength(0);
  });

  it("eine Aggregation über TeamSeason-IDs beider Tenants (hypothetischer Leak-Versuch) liefert für Tenant B ausschließlich eigene Zeilen", async () => {
    const dbB = getTenantPrisma(tenantBId);
    const matches = await dbB.footballMatch.findMany({
      where: { teamSeasonId: { in: [teamSeasonAId, teamSeasonBId] }, status: "COMPLETED" },
    });
    expect(matches).toHaveLength(0);
  });
});
