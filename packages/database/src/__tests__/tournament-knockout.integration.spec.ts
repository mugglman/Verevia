import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma, withTenantTransaction } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for the Phase 13 knockout foundation —
 * the relaxed `football_match_mode_consistency` CHECK (pending KO
 * participants) and the new `tournament_match_slot` table (ADR 0010).
 * Not part of `pnpm test` (needs a real PostgreSQL instance), same
 * reasoning as tournament-core.integration.spec.ts. Run via
 * `pnpm test:integration`.
 */

const rawPrisma = new PrismaClient();
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
let tournamentAId: string;
let tournamentA2Id: string; // second tournament in tenant A — for "wrong tournament" composite-FK tests
let tournamentBId: string;
let participantA1Id: string;
let participantA2Id: string;
let groupAId: string;
let groupA2Id: string; // group in tournamentA2, not tournamentA

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({
    data: { name: "Knockout Test Tenant A", slug: `knockout-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Knockout Test Tenant B", slug: `knockout-b-${Date.now()}` },
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
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "2026/2027", startsAt: new Date("2026-08-01"), endsAt: new Date("2027-06-30"), status: "ACTIVE" },
  });
  const seasonB = await adminPrisma.season.create({
    data: { tenantId: tenantBId, departmentId: departmentFootballBId, name: "2026/2027", startsAt: new Date("2026-08-01"), endsAt: new Date("2027-06-30"), status: "ACTIVE" },
  });
  seasonAId = seasonA.id;
  seasonBId = seasonB.id;

  const ageGroupA = await adminPrisma.ageGroup.create({ data: { tenantId: tenantAId, name: "E-Jugend", sortOrder: 1 } });
  const ageGroupB = await adminPrisma.ageGroup.create({ data: { tenantId: tenantBId, name: "E-Jugend", sortOrder: 1 } });
  ageGroupAId = ageGroupA.id;
  ageGroupBId = ageGroupB.id;

  const teamSeasonA = await adminPrisma.teamSeason.create({ data: { tenantId: tenantAId, teamId: teamE1AId, seasonId: seasonAId, ageGroupId: ageGroupAId } });
  // Tenant B's team season only needs to exist for FK realism (teamE1BId
  // above) — Phase 11's own suite already exhaustively covers cross-tenant
  // teamSeasonId rejection for TournamentParticipant.
  await adminPrisma.teamSeason.create({ data: { tenantId: tenantBId, teamId: teamE1BId, seasonId: seasonBId, ageGroupId: ageGroupBId } });
  teamSeasonAId = teamSeasonA.id;

  const tournamentA = await adminPrisma.footballTournament.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "KO Test Cup A", startsAt: new Date("2026-12-05T09:00:00.000Z"), mode: "KNOCKOUT" },
  });
  const tournamentA2 = await adminPrisma.footballTournament.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "KO Test Cup A2", startsAt: new Date("2026-12-06T09:00:00.000Z"), mode: "KNOCKOUT" },
  });
  const tournamentB = await adminPrisma.footballTournament.create({
    data: { tenantId: tenantBId, departmentId: departmentFootballBId, name: "KO Test Cup B", startsAt: new Date("2026-12-05T09:00:00.000Z"), mode: "KNOCKOUT" },
  });
  tournamentAId = tournamentA.id;
  tournamentA2Id = tournamentA2.id;
  tournamentBId = tournamentB.id;

  const participantA1 = await adminPrisma.tournamentParticipant.create({
    data: { tenantId: tenantAId, tournamentId: tournamentAId, teamSeasonId: teamSeasonAId },
  });
  const participantA2 = await adminPrisma.tournamentParticipant.create({
    data: { tenantId: tenantAId, tournamentId: tournamentAId, externalName: "SV KO-Test" },
  });
  participantA1Id = participantA1.id;
  participantA2Id = participantA2.id;

  const groupA = await adminPrisma.tournamentGroup.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, name: "Gruppe A" } });
  const groupA2 = await adminPrisma.tournamentGroup.create({ data: { tenantId: tenantAId, tournamentId: tournamentA2Id, name: "Gruppe X" } });
  groupAId = groupA.id;
  groupA2Id = groupA2.id;
});

afterAll(async () => {
  await adminPrisma.tournamentMatchSlot.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentParticipant.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballTournament.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.teamSeason.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.ageGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.season.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("football_match_mode_consistency — relaxed for pending KO participants (ADR 0010)", () => {
  it("accepts a tournament match with BOTH participants NULL (fully pending, e.g. a final before its semifinals are known)", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    expect(match.homeParticipantId).toBeNull();
    expect(match.awayParticipantId).toBeNull();
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("accepts a tournament match with only ONE participant known (e.g. a BYE-advanced team waiting for its semifinal opponent)", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, homeParticipantId: participantA1Id, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    expect(match.homeParticipantId).toBe(participantA1Id);
    expect(match.awayParticipantId).toBeNull();
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("still rejects homeParticipantId === awayParticipantId when both are set", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballMatch.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, homeParticipantId: participantA1Id, awayParticipantId: participantA1Id, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
      }),
    ).rejects.toThrow();
  });

  it("club-match mode is unaffected — still requires teamSeasonId AND opponentName when tournamentId is NULL", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballMatch.create({
        data: { tenantId: tenantAId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "FRIENDLY", homeAway: "HOME" },
      }),
    ).rejects.toThrow();
  });
});

describe("TournamentMatchSlot — composite-FK tenant/tournament consistency", () => {
  it("accepts a GROUP_POSITION slot referencing a match and group of the SAME tournament", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    const slot = await db.tournamentMatchSlot.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: match.id, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 1 },
    });
    expect(slot.groupId).toBe(groupAId);
    await adminPrisma.tournamentMatchSlot.delete({ where: { id: slot.id } });
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("accepts a WINNER_OF_MATCH slot referencing another match of the SAME tournament as its source", async () => {
    const db = getTenantPrisma(tenantAId);
    const sourceMatch = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, homeParticipantId: participantA1Id, awayParticipantId: participantA2Id, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    const dependentMatch = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T11:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    const slot = await db.tournamentMatchSlot.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: dependentMatch.id, side: "HOME", sourceType: "WINNER_OF_MATCH", sourceMatchId: sourceMatch.id },
    });
    expect(slot.sourceMatchId).toBe(sourceMatch.id);
    await adminPrisma.tournamentMatchSlot.delete({ where: { id: slot.id } });
    await adminPrisma.footballMatch.deleteMany({ where: { id: { in: [sourceMatch.id, dependentMatch.id] } } });
  });

  it("rejects a slot whose matchId belongs to a DIFFERENT tournament (same tenant)", async () => {
    const db = getTenantPrisma(tenantAId);
    const matchInOtherTournament = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentA2Id, startsAt: new Date("2026-12-06T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    await expect(
      db.tournamentMatchSlot.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: matchInOtherTournament.id, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 1 },
      }),
    ).rejects.toThrow();
    await adminPrisma.footballMatch.delete({ where: { id: matchInOtherTournament.id } });
  });

  it("rejects a slot whose groupId belongs to a DIFFERENT tournament (same tenant)", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    await expect(
      db.tournamentMatchSlot.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: match.id, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupA2Id, groupPosition: 1 },
      }),
    ).rejects.toThrow();
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("rejects a slot whose sourceMatchId belongs to a DIFFERENT tournament (same tenant)", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    const matchInOtherTournament = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentA2Id, startsAt: new Date("2026-12-06T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    await expect(
      db.tournamentMatchSlot.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: match.id, side: "HOME", sourceType: "WINNER_OF_MATCH", sourceMatchId: matchInOtherTournament.id },
      }),
    ).rejects.toThrow();
    await adminPrisma.footballMatch.deleteMany({ where: { id: { in: [match.id, matchInOtherTournament.id] } } });
  });

  it("rejects a slot whose matchId belongs to a DIFFERENT tenant", async () => {
    const dbB = getTenantPrisma(tenantBId);
    const matchB = await dbB.footballMatch.create({
      data: { tenantId: tenantBId, tournamentId: tournamentBId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    const dbA = getTenantPrisma(tenantAId);
    await expect(
      dbA.tournamentMatchSlot.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: matchB.id, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 1 },
      }),
    ).rejects.toThrow();
    await adminPrisma.footballMatch.delete({ where: { id: matchB.id } });
  });

  it("rejects a second slot for the same (match, side) pair — unique constraint", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    await db.tournamentMatchSlot.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: match.id, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 1 },
    });
    await expect(
      db.tournamentMatchSlot.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: match.id, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 2 },
      }),
    ).rejects.toThrow();
    await adminPrisma.tournamentMatchSlot.deleteMany({ where: { matchId: match.id } });
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("cascades: deleting the owning match also removes its slot rows", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    const slot = await db.tournamentMatchSlot.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: match.id, side: "AWAY", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 2 },
    });
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
    const stillThere = await adminPrisma.tournamentMatchSlot.findUnique({ where: { id: slot.id } });
    expect(stillThere).toBeNull();
  });

  it("commit atomicity: a failure in the SECOND createMany (slots) rolls back the FIRST (matches) too — same transaction pattern as TournamentKnockoutService.commit", async () => {
    // Mirrors the exact two-step sequence the real commit performs inside
    // withTenantTransaction: insert all FootballMatch rows, THEN insert
    // their TournamentMatchSlot rows. If the second step fails, nothing
    // from either step should survive — proving the whole commit is one
    // atomic unit, not two independently-committed writes.
    const matchIdA = randomUUID();
    const matchIdB = randomUUID();

    await expect(
      withTenantTransaction(tenantAId, async (tx) => {
        await tx.footballMatch.createMany({
          data: [
            { id: matchIdA, tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
            { id: matchIdB, tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T11:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
          ],
        });
        await tx.tournamentMatchSlot.createMany({
          data: [
            { tenantId: tenantAId, tournamentId: tournamentAId, matchId: matchIdA, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 1 },
            // Deliberately invalid: sourceMatchId references a match that
            // doesn't exist — violates the composite FK.
            { tenantId: tenantAId, tournamentId: tournamentAId, matchId: matchIdB, side: "HOME", sourceType: "WINNER_OF_MATCH", sourceMatchId: randomUUID() },
          ],
        });
      }),
    ).rejects.toThrow();

    const remainingMatches = await adminPrisma.footballMatch.count({ where: { id: { in: [matchIdA, matchIdB] } } });
    const remainingSlots = await adminPrisma.tournamentMatchSlot.count({ where: { matchId: { in: [matchIdA, matchIdB] } } });
    expect(remainingMatches).toBe(0);
    expect(remainingSlots).toBe(0);
  });
});

describe("PostgreSQL RLS — tenant isolation (TournamentMatchSlot)", () => {
  it("Tenant B does NOT see Tenant A's TournamentMatchSlot", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const match = await dbA.footballMatch.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    const slot = await dbA.tournamentMatchSlot.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: match.id, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 1 },
    });

    const dbB = getTenantPrisma(tenantBId);
    const seenByB = await dbB.tournamentMatchSlot.findUnique({ where: { id: slot.id } });
    expect(seenByB).toBeNull();

    const rawSeen = await rawPrisma.tournamentMatchSlot.findUnique({ where: { id: slot.id } });
    expect(rawSeen).toBeNull();

    await adminPrisma.tournamentMatchSlot.delete({ where: { id: slot.id } });
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("a connection with no app.tenant_id set sees NO TournamentMatchSlot rows (fail closed)", async () => {
    const rows = await rawPrisma.tournamentMatchSlot.findMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    expect(rows).toHaveLength(0);
  });
});
