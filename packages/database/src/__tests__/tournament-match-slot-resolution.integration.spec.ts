import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma, withTenantTransaction } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for Phase 14's TournamentMatchSlot resolution
 * — the new `football_match.resultPropagatedAt` column and the atomicity/
 * locking behavior of the resolution transaction pattern used by
 * MatchesService.updateTournamentMatch/resolveDependentSlots. These tests
 * replicate that exact transaction shape directly against Prisma (same
 * convention as tournament-knockout.integration.spec.ts's "commit
 * atomicity" test) to prove the DB-level guarantees independent of HTTP/
 * NestJS — the full end-to-end flow (auth, DTO validation, the real
 * service) is covered separately by the API integration tests. Not part
 * of `pnpm test` (needs a real PostgreSQL instance). Run via
 * `pnpm test:integration`.
 */

const rawPrisma = new PrismaClient();
const adminPrisma = createAdminPrismaForTests();

let tenantAId: string;
let tenantBId: string;
let departmentFootballAId: string;
let tournamentAId: string;
let participantAId: string;
let participantBId: string;
let participantCId: string;
let participantDId: string;

/** Builds a fresh SF1/SF2/FINAL trio with FINAL's home/away pending on SF1/SF2's winner. Returns their ids. */
async function createBracket() {
  const sf1Id = randomUUID();
  const sf2Id = randomUUID();
  const finalId = randomUUID();

  await adminPrisma.footballMatch.createMany({
    data: [
      {
        id: sf1Id,
        tenantId: tenantAId,
        tournamentId: tournamentAId,
        homeParticipantId: participantAId,
        awayParticipantId: participantBId,
        startsAt: new Date("2026-12-05T09:00:00.000Z"),
        type: "TOURNAMENT",
        homeAway: "NEUTRAL",
      },
      {
        id: sf2Id,
        tenantId: tenantAId,
        tournamentId: tournamentAId,
        homeParticipantId: participantCId,
        awayParticipantId: participantDId,
        startsAt: new Date("2026-12-05T09:20:00.000Z"),
        type: "TOURNAMENT",
        homeAway: "NEUTRAL",
      },
      {
        id: finalId,
        tenantId: tenantAId,
        tournamentId: tournamentAId,
        homeParticipantId: null,
        awayParticipantId: null,
        startsAt: new Date("2026-12-05T10:00:00.000Z"),
        type: "TOURNAMENT",
        homeAway: "NEUTRAL",
      },
    ],
  });
  await adminPrisma.tournamentMatchSlot.createMany({
    data: [
      { tenantId: tenantAId, tournamentId: tournamentAId, matchId: finalId, side: "HOME", sourceType: "WINNER_OF_MATCH", sourceMatchId: sf1Id },
      { tenantId: tenantAId, tournamentId: tournamentAId, matchId: finalId, side: "AWAY", sourceType: "WINNER_OF_MATCH", sourceMatchId: sf2Id },
    ],
  });
  return { sf1Id, sf2Id, finalId };
}

/** Same transaction shape as MatchesService.updateTournamentMatch + resolveDependentSlots. */
async function finalizeAndResolve(tenantId: string, matchId: string, homeScore: number, awayScore: number) {
  return withTenantTransaction(tenantId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM football_match WHERE id = ${matchId} FOR UPDATE`;
    const match = await tx.footballMatch.update({
      where: { id: matchId },
      data: { status: "COMPLETED", homeScore, awayScore },
    });

    // A draw has no determinable winner/loser (see determineMatchOutcome) —
    // leave every dependent slot untouched, same as the real service.
    if (homeScore === awayScore) return match;

    const winnerParticipantId = homeScore > awayScore ? match.homeParticipantId! : match.awayParticipantId!;
    const loserParticipantId = homeScore > awayScore ? match.awayParticipantId! : match.homeParticipantId!;

    const pendingSlots = await tx.tournamentMatchSlot.findMany({
      where: { sourceMatchId: matchId, sourceType: { in: ["WINNER_OF_MATCH", "LOSER_OF_MATCH"] } },
    });
    if (pendingSlots.length === 0) return match;

    const targetIds = [...new Set(pendingSlots.map((s) => s.matchId))];
    for (const targetId of targetIds) {
      await tx.$queryRaw`SELECT id FROM football_match WHERE id = ${targetId} FOR UPDATE`;
    }
    for (const slot of pendingSlots) {
      const participantId = slot.sourceType === "WINNER_OF_MATCH" ? winnerParticipantId : loserParticipantId;
      await tx.footballMatch.update({
        where: { id: slot.matchId },
        data: slot.side === "HOME" ? { homeParticipantId: participantId } : { awayParticipantId: participantId },
      });
    }
    await tx.tournamentMatchSlot.deleteMany({ where: { id: { in: pendingSlots.map((s) => s.id) } } });
    await tx.footballMatch.update({ where: { id: matchId }, data: { resultPropagatedAt: new Date() } });
    return match;
  });
}

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({ data: { name: "Slot Resolution Test Tenant A", slug: `slot-resolution-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Slot Resolution Test Tenant B", slug: `slot-resolution-b-${Date.now()}` } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const departmentFootballA = await adminPrisma.department.create({ data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" } });
  departmentFootballAId = departmentFootballA.id;

  const tournamentA = await adminPrisma.footballTournament.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "Slot Resolution Test Cup", startsAt: new Date("2026-12-05T08:00:00.000Z"), mode: "KNOCKOUT" },
  });
  tournamentAId = tournamentA.id;

  const [pa, pb, pc, pd] = await Promise.all([
    adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, externalName: "Team A" } }),
    adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, externalName: "Team B" } }),
    adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, externalName: "Team C" } }),
    adminPrisma.tournamentParticipant.create({ data: { tenantId: tenantAId, tournamentId: tournamentAId, externalName: "Team D" } }),
  ]);
  participantAId = pa.id;
  participantBId = pb.id;
  participantCId = pc.id;
  participantDId = pd.id;
});

afterAll(async () => {
  await adminPrisma.tournamentMatchSlot.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentParticipant.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballTournament.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("football_match.resultPropagatedAt — column behavior", () => {
  it("defaults to NULL for a freshly created match", async () => {
    const { sf1Id } = await createBracket();
    const match = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: sf1Id } });
    expect(match.resultPropagatedAt).toBeNull();
  });

  it("is set after successfully resolving at least one dependent slot", async () => {
    const { sf1Id } = await createBracket();
    await finalizeAndResolve(tenantAId, sf1Id, 2, 1);
    const match = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: sf1Id } });
    expect(match.resultPropagatedAt).not.toBeNull();
  });

  it("stays NULL for a completed match with no dependent slots (e.g. the Final itself)", async () => {
    const { finalId } = await createBracket();
    await adminPrisma.footballMatch.update({ where: { id: finalId }, data: { homeParticipantId: participantAId, awayParticipantId: participantCId } });
    await finalizeAndResolve(tenantAId, finalId, 3, 0);
    const match = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(match.resultPropagatedAt).toBeNull();
  });
});

describe("Slot resolution — atomicity", () => {
  it("finalizing SF1 resolves the Final's HOME slot and deletes it, in one transaction", async () => {
    const { sf1Id, finalId } = await createBracket();
    await finalizeAndResolve(tenantAId, sf1Id, 2, 1);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBe(participantAId); // 2:1 -> home (Team A) wins
    expect(final.awayParticipantId).toBeNull(); // SF2 not finalized yet

    const remainingSlots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalId } });
    expect(remainingSlots).toHaveLength(1);
    expect(remainingSlots[0]!.side).toBe("AWAY");
  });

  it("finalizing both semifinals resolves both Final sides correctly, regardless of order", async () => {
    const { sf1Id, sf2Id, finalId } = await createBracket();
    await finalizeAndResolve(tenantAId, sf2Id, 0, 2); // away (Team D) wins, resolved first
    await finalizeAndResolve(tenantAId, sf1Id, 2, 1); // home (Team A) wins, resolved second

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBe(participantAId);
    expect(final.awayParticipantId).toBe(participantDId);

    const remainingSlots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalId } });
    expect(remainingSlots).toHaveLength(0);
  });

  it("a draw does not resolve any dependent slot and does not set resultPropagatedAt", async () => {
    const { sf1Id, finalId } = await createBracket();
    await finalizeAndResolve(tenantAId, sf1Id, 1, 1);

    const sf1 = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: sf1Id } });
    expect(sf1.resultPropagatedAt).toBeNull();
    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBeNull();
    const remainingSlots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalId, side: "HOME" } });
    expect(remainingSlots).toHaveLength(1);
  });

  it("re-finalizing an already-resolved match with the identical result is a safe no-op (idempotent)", async () => {
    const { sf1Id, finalId } = await createBracket();
    await finalizeAndResolve(tenantAId, sf1Id, 2, 1);
    await finalizeAndResolve(tenantAId, sf1Id, 2, 1); // repeat, identical

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBe(participantAId);
    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalId } });
    expect(slots).toHaveLength(1); // only the AWAY slot remains — no duplicate/corrupted state from the repeat
  });

  it("rollback: a failure after the match update but before slot cleanup leaves NEITHER change persisted", async () => {
    const { sf1Id, finalId } = await createBracket();

    await expect(
      withTenantTransaction(tenantAId, async (tx) => {
        await tx.footballMatch.update({ where: { id: sf1Id }, data: { status: "COMPLETED", homeScore: 2, awayScore: 1 } });
        await tx.footballMatch.update({ where: { id: finalId }, data: { homeParticipantId: participantAId } });
        // Simulate a failure mid-resolution (e.g. an unexpected constraint
        // violation) before the slot is deleted / resultPropagatedAt is set.
        await tx.tournamentMatchSlot.create({
          data: {
            tenantId: tenantAId,
            tournamentId: tournamentAId,
            matchId: finalId,
            side: "HOME", // duplicate (tenantId, matchId, side) -> unique constraint violation
            sourceType: "WINNER_OF_MATCH",
            sourceMatchId: sf1Id,
          },
        });
      }),
    ).rejects.toThrow();

    const sf1 = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: sf1Id } });
    expect(sf1.status).toBe("SCHEDULED"); // rolled back, not COMPLETED
    expect(sf1.resultPropagatedAt).toBeNull();
    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBeNull(); // rolled back
    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalId } });
    expect(slots).toHaveLength(2); // original two slots untouched, no duplicate
  });
});

describe("Slot resolution — concurrency", () => {
  it("two concurrent semifinal finalizations (different source matches, same target Final) both resolve correctly", async () => {
    const { sf1Id, sf2Id, finalId } = await createBracket();

    await Promise.all([finalizeAndResolve(tenantAId, sf1Id, 2, 1), finalizeAndResolve(tenantAId, sf2Id, 0, 3)]);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBe(participantAId); // from SF1
    expect(final.awayParticipantId).toBe(participantDId); // from SF2 (away won 3:0)
    const remainingSlots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalId } });
    expect(remainingSlots).toHaveLength(0);
  });

  it("two concurrent identical finalizations of the SAME match are serialized by the row lock and leave a consistent, non-duplicated result", async () => {
    const { sf1Id, finalId } = await createBracket();

    const results = await Promise.allSettled([finalizeAndResolve(tenantAId, sf1Id, 2, 1), finalizeAndResolve(tenantAId, sf1Id, 2, 1)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true); // both succeed — the second is a harmless idempotent repeat

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalId } });
    expect(final.homeParticipantId).toBe(participantAId);
    const remainingSlots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalId } });
    expect(remainingSlots).toHaveLength(1); // exactly one HOME resolution, not duplicated
  });
});

describe("PostgreSQL RLS — tenant isolation for resultPropagatedAt / resolution", () => {
  it("Tenant B's tenant-scoped client cannot see or resolve Tenant A's matches/slots", async () => {
    const { sf1Id } = await createBracket();
    const dbB = getTenantPrisma(tenantBId);

    const matchFromB = await dbB.footballMatch.findUnique({ where: { id: sf1Id } });
    expect(matchFromB).toBeNull();

    await expect(finalizeAndResolve(tenantBId, sf1Id, 2, 1)).rejects.toThrow();
    const sf1 = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: sf1Id } });
    expect(sf1.status).toBe("SCHEDULED"); // untouched by tenant B's attempt
  });
});
