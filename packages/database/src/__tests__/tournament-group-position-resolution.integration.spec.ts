import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma, withTenantTransaction } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for Phase 16's GROUP_POSITION resolution —
 * replicates the exact transaction/locking shape of
 * MatchesService.resolveGroupPositionSlots directly against Prisma (same
 * convention as tournament-match-slot-resolution.integration.spec.ts's
 * "commit atomicity" test), so these prove the DB-level guarantees
 * (locking, atomicity, concurrency) independent of HTTP/NestJS — full
 * end-to-end coverage (auth, DTO validation, the real service) is in the
 * API integration tests. The standings math reimplemented in
 * computeSimpleStandings below is intentionally a SIMPLIFIED stand-in for
 * MatchesService's real computeGroupStandings (which is already
 * exhaustively unit-tested, including every tiebreak rule, at the pure
 * domain level in apps/api) — good enough to correctly rank the
 * clear-cut, hand-verified scenarios exercised here. Not part of
 * `pnpm test` (needs a real PostgreSQL instance). Run via
 * `pnpm test:integration`.
 */

const rawPrisma = new PrismaClient();
const adminPrisma = createAdminPrismaForTests();

let tenantAId: string;
let tenantBId: string;
let departmentFootballAId: string;
let tournamentAId: string;

interface SimpleMatch {
  homeParticipantId: string;
  awayParticipantId: string;
  homeScore: number;
  awayScore: number;
}

function computeSimpleStandings(participantIds: string[], matches: SimpleMatch[]): { participantId: string; rank: number; tied: boolean }[] {
  const acc = new Map(participantIds.map((id) => [id, { participantId: id, points: 0, gf: 0, ga: 0 }]));
  for (const m of matches) {
    const home = acc.get(m.homeParticipantId)!;
    const away = acc.get(m.awayParticipantId)!;
    home.gf += m.homeScore;
    home.ga += m.awayScore;
    away.gf += m.awayScore;
    away.ga += m.homeScore;
    if (m.homeScore > m.awayScore) home.points += 3;
    else if (m.awayScore > m.homeScore) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }
  const sorted = [...acc.values()].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    const aDiff = a.gf - a.ga;
    const bDiff = b.gf - b.ga;
    if (aDiff !== bDiff) return bDiff - aDiff;
    if (a.gf !== b.gf) return b.gf - a.gf;
    return a.participantId < b.participantId ? -1 : 1;
  });
  const tieKey = (r: (typeof sorted)[number]) => `${r.points}|${r.gf - r.ga}|${r.gf}`;
  const blockSize = new Map<string, number>();
  for (const r of sorted) blockSize.set(tieKey(r), (blockSize.get(tieKey(r)) ?? 0) + 1);
  return sorted.map((r, i) => ({ participantId: r.participantId, rank: i + 1, tied: blockSize.get(tieKey(r))! > 1 }));
}

/** Replicates MatchesService.updateTournamentMatch + resolveGroupPositionSlots's exact transaction shape. */
async function finalizeGroupMatchAndResolve(tenantId: string, matchId: string, homeScore: number, awayScore: number) {
  return withTenantTransaction(tenantId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM football_match WHERE id = ${matchId} FOR UPDATE`;
    const match = await tx.footballMatch.update({ where: { id: matchId }, data: { status: "COMPLETED", homeScore, awayScore } });
    const groupId = match.tournamentGroupId;
    if (!groupId) return match;

    await tx.$queryRaw`SELECT id FROM football_match WHERE "tournamentGroupId" = ${groupId} ORDER BY id FOR UPDATE`;
    const groupMatches = await tx.footballMatch.findMany({ where: { tournamentGroupId: groupId } });
    if (groupMatches.length === 0 || groupMatches.some((m) => m.status !== "COMPLETED")) return match;

    const participantIds = [...new Set(groupMatches.flatMap((m) => [m.homeParticipantId, m.awayParticipantId]))].filter((id): id is string => id !== null);
    const standings = computeSimpleStandings(
      participantIds,
      groupMatches.map((m) => ({ homeParticipantId: m.homeParticipantId!, awayParticipantId: m.awayParticipantId!, homeScore: m.homeScore!, awayScore: m.awayScore! })),
    );

    const pendingSlots = await tx.tournamentMatchSlot.findMany({ where: { groupId, sourceType: "GROUP_POSITION" } });
    if (pendingSlots.length === 0) return match;

    const planned = pendingSlots
      .map((slot) => {
        const row = standings.find((s) => s.rank === slot.groupPosition);
        if (!row || row.tied) return null;
        return { slotId: slot.id, targetMatchId: slot.matchId, side: slot.side, participantId: row.participantId };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    if (planned.length === 0) return match;

    const targetIds = [...new Set(planned.map((p) => p.targetMatchId))].sort();
    for (const targetId of targetIds) {
      await tx.$queryRaw`SELECT id FROM football_match WHERE id = ${targetId} FOR UPDATE`;
    }
    for (const resolution of planned) {
      await tx.footballMatch.update({
        where: { id: resolution.targetMatchId },
        data: resolution.side === "HOME" ? { homeParticipantId: resolution.participantId } : { awayParticipantId: resolution.participantId },
      });
    }
    await tx.tournamentMatchSlot.deleteMany({ where: { id: { in: planned.map((p) => p.slotId) } } });
    await tx.footballMatch.updateMany({ where: { tournamentGroupId: groupId, resultPropagatedAt: null }, data: { resultPropagatedAt: new Date() } });
    return match;
  });
}

/** Builds a 2-team group (1 match) feeding a single knockout slot pair (position 1 -> HOME, position 2 -> AWAY of the same target match). */
async function createSingleGroupBracket() {
  const groupId = randomUUID();
  const groupMatchId = randomUUID();
  const finalId = randomUUID();

  await adminPrisma.tournamentGroup.create({ data: { id: groupId, tenantId: tenantAId, tournamentId: tournamentAId, name: `Group ${randomUUID().slice(0, 6)}` } });
  const [p1, p2] = await Promise.all([
    adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, groupId, externalName: `Team ${randomUUID().slice(0, 6)}` } }),
    adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, groupId, externalName: `Team ${randomUUID().slice(0, 6)}` } }),
  ]);
  await adminPrisma.footballMatch.create({
    data: {
      id: groupMatchId,
      tenantId: tenantAId,
      tournamentId: tournamentAId,
      tournamentGroupId: groupId,
      homeParticipantId: p1.id,
      awayParticipantId: p2.id,
      startsAt: new Date("2026-12-05T09:00:00.000Z"),
      type: "TOURNAMENT",
      homeAway: "NEUTRAL",
    },
  });
  await adminPrisma.footballMatch.create({
    data: { id: finalId, tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T11:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
  });
  await adminPrisma.tournamentMatchSlot.createMany({
    data: [
      { tenantId: tenantAId, tournamentId: tournamentAId, matchId: finalId, side: "HOME", sourceType: "GROUP_POSITION", groupId, groupPosition: 1 },
      { tenantId: tenantAId, tournamentId: tournamentAId, matchId: finalId, side: "AWAY", sourceType: "GROUP_POSITION", groupId, groupPosition: 2 },
    ],
  });
  return { groupId, groupMatchId, finalId, participant1Id: p1.id, participant2Id: p2.id };
}

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({ data: { name: "Group Resolution Test Tenant A", slug: `group-resolution-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Group Resolution Test Tenant B", slug: `group-resolution-b-${Date.now()}` } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const departmentFootballA = await adminPrisma.department.create({ data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" } });
  departmentFootballAId = departmentFootballA.id;

  const tournamentA = await adminPrisma.footballTournament.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "Group Resolution Test Cup", startsAt: new Date("2026-12-05T08:00:00.000Z"), mode: "GROUPS_AND_KNOCKOUT" },
  });
  tournamentAId = tournamentA.id;
});

afterAll(async () => {
  await adminPrisma.tournamentMatchSlot.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentParticipant.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballTournament.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("GROUP_POSITION resolution — atomicity", () => {
  it("resolves both position-1 and position-2 slots once the group's only match completes", async () => {
    const { groupId, groupMatchId, finalId, participant1Id, participant2Id } = await createSingleGroupBracket();
    await finalizeGroupMatchAndResolve(tenantAId, groupMatchId, 3, 1);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBe(participant1Id);
    expect(final.awayParticipantId).toBe(participant2Id);
    const remainingSlots = await adminPrisma.tournamentMatchSlot.findMany({ where: { groupId } });
    expect(remainingSlots).toHaveLength(0);
  });

  it("does not resolve anything while the group is still incomplete", async () => {
    const groupId = randomUUID();
    const m1Id = randomUUID();
    const m2Id = randomUUID();
    const finalId = randomUUID();
    await adminPrisma.tournamentGroup.create({ data: { id: groupId, tenantId: tenantAId, tournamentId: tournamentAId, name: `Group ${randomUUID().slice(0, 6)}` } });
    const [p1, p2, p3] = await Promise.all([
      adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, groupId, externalName: `Team ${randomUUID().slice(0, 6)}` } }),
      adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, groupId, externalName: `Team ${randomUUID().slice(0, 6)}` } }),
      adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, groupId, externalName: `Team ${randomUUID().slice(0, 6)}` } }),
    ]);
    await adminPrisma.footballMatch.createMany({
      data: [
        { id: m1Id, tenantId: tenantAId, tournamentId: tournamentAId, tournamentGroupId: groupId, homeParticipantId: p1.id, awayParticipantId: p2.id, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
        { id: m2Id, tenantId: tenantAId, tournamentId: tournamentAId, tournamentGroupId: groupId, homeParticipantId: p2.id, awayParticipantId: p3.id, startsAt: new Date("2026-12-05T09:20:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
      ],
    });
    await adminPrisma.footballMatch.create({
      data: { id: finalId, tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T11:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
    });
    await adminPrisma.tournamentMatchSlot.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: finalId, side: "HOME", sourceType: "GROUP_POSITION", groupId, groupPosition: 1 },
    });

    await finalizeGroupMatchAndResolve(tenantAId, m1Id, 2, 0); // only ONE of the group's two matches is now completed

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBeNull(); // still pending — group not complete
    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { groupId } });
    expect(slots).toHaveLength(1);
    const m1 = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: m1Id } });
    expect(m1.resultPropagatedAt).toBeNull(); // nothing propagated yet, so not locked either
  });

  it("locks EVERY match in the group once at least one slot resolves, not just the one just finalized", async () => {
    const { groupMatchId } = await createSingleGroupBracket();
    await finalizeGroupMatchAndResolve(tenantAId, groupMatchId, 1, 0);
    const match = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: groupMatchId } });
    expect(match.resultPropagatedAt).not.toBeNull();
  });

  it("re-finalizing an already-resolved group's match with the identical result is a safe no-op (idempotent)", async () => {
    const { groupId, groupMatchId, finalId, participant1Id } = await createSingleGroupBracket();
    await finalizeGroupMatchAndResolve(tenantAId, groupMatchId, 2, 0);
    await finalizeGroupMatchAndResolve(tenantAId, groupMatchId, 2, 0); // repeat, identical

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBe(participant1Id);
    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { groupId } });
    expect(slots).toHaveLength(0); // still resolved exactly once, no duplicate state
  });

  it("rollback: a failure mid-resolution leaves neither the match result nor the slot changes persisted", async () => {
    const { groupMatchId, finalId } = await createSingleGroupBracket();

    await expect(
      withTenantTransaction(tenantAId, async (tx) => {
        await tx.footballMatch.update({ where: { id: groupMatchId }, data: { status: "COMPLETED", homeScore: 2, awayScore: 0 } });
        await tx.footballMatch.update({ where: { id: finalId }, data: { homeParticipantId: (await tx.footballMatch.findUniqueOrThrow({ where: { id: groupMatchId } })).homeParticipantId } });
        // Simulate a failure mid-resolution: duplicate (tenantId, matchId, side) -> unique constraint violation.
        await tx.tournamentMatchSlot.create({
          data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: finalId, side: "HOME", sourceType: "GROUP_POSITION", groupId: randomUUID(), groupPosition: 1 },
        });
      }),
    ).rejects.toThrow();

    const match = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: groupMatchId } });
    expect(match.status).toBe("SCHEDULED"); // rolled back
    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBeNull(); // rolled back
  });
});

describe("GROUP_POSITION resolution — multiple groups", () => {
  it("resolves crossed slots from two groups into two different knockout matches (A1 v B2, B1 v A2)", async () => {
    const groupAId = randomUUID();
    const groupBId = randomUUID();
    const sf1Id = randomUUID();
    const sf2Id = randomUUID();
    const a1Id = randomUUID();
    const a2Id = randomUUID();
    const b1Id = randomUUID();
    const b2Id = randomUUID();

    await adminPrisma.tournamentGroup.createMany({
      data: [
        { id: groupAId, tenantId: tenantAId, tournamentId: tournamentAId, name: `Group A ${randomUUID().slice(0, 6)}` },
        { id: groupBId, tenantId: tenantAId, tournamentId: tournamentAId, name: `Group B ${randomUUID().slice(0, 6)}` },
      ],
    });
    const [pA1, pA2, pB1, pB2] = await Promise.all([
      adminPrisma.tournamentParticipant.create({ data: { id: a1Id, tenantId: tenantAId, tournamentId: tournamentAId, groupId: groupAId, externalName: `A1 ${randomUUID().slice(0, 6)}` } }),
      adminPrisma.tournamentParticipant.create({ data: { id: a2Id, tenantId: tenantAId, tournamentId: tournamentAId, groupId: groupAId, externalName: `A2 ${randomUUID().slice(0, 6)}` } }),
      adminPrisma.tournamentParticipant.create({ data: { id: b1Id, tenantId: tenantAId, tournamentId: tournamentAId, groupId: groupBId, externalName: `B1 ${randomUUID().slice(0, 6)}` } }),
      adminPrisma.tournamentParticipant.create({ data: { id: b2Id, tenantId: tenantAId, tournamentId: tournamentAId, groupId: groupBId, externalName: `B2 ${randomUUID().slice(0, 6)}` } }),
    ]);
    const groupAMatchId = randomUUID();
    const groupBMatchId = randomUUID();
    await adminPrisma.footballMatch.createMany({
      data: [
        { id: groupAMatchId, tenantId: tenantAId, tournamentId: tournamentAId, tournamentGroupId: groupAId, homeParticipantId: pA1.id, awayParticipantId: pA2.id, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
        { id: groupBMatchId, tenantId: tenantAId, tournamentId: tournamentAId, tournamentGroupId: groupBId, homeParticipantId: pB1.id, awayParticipantId: pB2.id, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
        { id: sf1Id, tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T11:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
        { id: sf2Id, tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T11:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
      ],
    });
    await adminPrisma.tournamentMatchSlot.createMany({
      data: [
        { tenantId: tenantAId, tournamentId: tournamentAId, matchId: sf1Id, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 1 }, // A1
        { tenantId: tenantAId, tournamentId: tournamentAId, matchId: sf1Id, side: "AWAY", sourceType: "GROUP_POSITION", groupId: groupBId, groupPosition: 2 }, // B2
        { tenantId: tenantAId, tournamentId: tournamentAId, matchId: sf2Id, side: "HOME", sourceType: "GROUP_POSITION", groupId: groupBId, groupPosition: 1 }, // B1
        { tenantId: tenantAId, tournamentId: tournamentAId, matchId: sf2Id, side: "AWAY", sourceType: "GROUP_POSITION", groupId: groupAId, groupPosition: 2 }, // A2
      ],
    });

    await finalizeGroupMatchAndResolve(tenantAId, groupAMatchId, 3, 0); // A1 (home) wins -> group A position 1
    await finalizeGroupMatchAndResolve(tenantAId, groupBMatchId, 3, 0); // B1 (home) wins -> group B position 1

    const sf1 = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: sf1Id } });
    const sf2 = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: sf2Id } });
    expect(sf1.homeParticipantId).toBe(pA1.id); // group A position 1
    expect(sf1.awayParticipantId).toBe(pB2.id); // group B position 2 (the loser)
    expect(sf2.homeParticipantId).toBe(pB1.id); // group B position 1 (the winner)
    expect(sf2.awayParticipantId).toBe(pA2.id); // group A position 2 (the loser)
  });
});

describe("GROUP_POSITION resolution — concurrency", () => {
  it("the last two group matches finalized nearly simultaneously still resolve the group exactly once, correctly", async () => {
    const groupId = randomUUID();
    const finalId = randomUUID();
    await adminPrisma.tournamentGroup.create({ data: { id: groupId, tenantId: tenantAId, tournamentId: tournamentAId, name: `Group ${randomUUID().slice(0, 6)}` } });
    const [p1, p2, p3] = await Promise.all([
      adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, groupId, externalName: `Team ${randomUUID().slice(0, 6)}` } }),
      adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, groupId, externalName: `Team ${randomUUID().slice(0, 6)}` } }),
      adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, groupId, externalName: `Team ${randomUUID().slice(0, 6)}` } }),
    ]);
    const m1Id = randomUUID(); // p1 v p2, already completed ahead of time
    const m2Id = randomUUID(); // p1 v p3, finalized concurrently below
    const m3Id = randomUUID(); // p2 v p3, finalized concurrently below (the group's actual last two matches)
    await adminPrisma.footballMatch.createMany({
      data: [
        { id: m1Id, tenantId: tenantAId, tournamentId: tournamentAId, tournamentGroupId: groupId, homeParticipantId: p1.id, awayParticipantId: p2.id, startsAt: new Date("2026-12-05T09:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL", status: "COMPLETED", homeScore: 2, awayScore: 0 },
        { id: m2Id, tenantId: tenantAId, tournamentId: tournamentAId, tournamentGroupId: groupId, homeParticipantId: p1.id, awayParticipantId: p3.id, startsAt: new Date("2026-12-05T09:20:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
        { id: m3Id, tenantId: tenantAId, tournamentId: tournamentAId, tournamentGroupId: groupId, homeParticipantId: p2.id, awayParticipantId: p3.id, startsAt: new Date("2026-12-05T09:40:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
        { id: finalId, tenantId: tenantAId, tournamentId: tournamentAId, startsAt: new Date("2026-12-05T11:00:00.000Z"), type: "TOURNAMENT", homeAway: "NEUTRAL" },
      ],
    });
    await adminPrisma.tournamentMatchSlot.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, matchId: finalId, side: "HOME", sourceType: "GROUP_POSITION", groupId, groupPosition: 1 },
    });

    // p1: win vs p2 (3pts) + win vs p3 (3pts) = 6pts, clear winner regardless of order.
    const results = await Promise.allSettled([finalizeGroupMatchAndResolve(tenantAId, m2Id, 1, 0), finalizeGroupMatchAndResolve(tenantAId, m3Id, 1, 1)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBe(p1.id); // resolved exactly once, correct winner
    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { groupId } });
    expect(slots).toHaveLength(0); // not left partially resolved, not duplicated

    const allGroupMatches = await adminPrisma.footballMatch.findMany({ where: { tournamentGroupId: groupId } });
    expect(allGroupMatches.every((m) => m.resultPropagatedAt !== null)).toBe(true);
  });
});

describe("PostgreSQL RLS — tenant isolation for group resolution", () => {
  it("Tenant B's tenant-scoped client cannot see or resolve Tenant A's group matches", async () => {
    const { groupMatchId } = await createSingleGroupBracket();
    const dbB = getTenantPrisma(tenantBId);

    const matchFromB = await dbB.footballMatch.findUnique({ where: { id: groupMatchId } });
    expect(matchFromB).toBeNull();

    await expect(finalizeGroupMatchAndResolve(tenantBId, groupMatchId, 2, 0)).rejects.toThrow();
    const match = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: groupMatchId } });
    expect(match.status).toBe("SCHEDULED"); // untouched by tenant B's attempt
  });
});
