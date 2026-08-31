import "reflect-metadata";
import { INestApplication, RequestMethod, ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@verevia/auth";
import { createAdminPrismaForTests, getTenantPrisma } from "@verevia/database";
import { AppModule } from "../src/app.module";

/**
 * End-to-end verification of Phase 14's TournamentMatchSlot resolution
 * (finalizing a knockout match automatically fills in dependent slots)
 * against a real PostgreSQL instance and real better-auth sessions. Not
 * part of `pnpm test`/CI (no DB there), same reasoning as
 * tournament-knockout.integration-spec.ts. Run via `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let tenantBId: string;
let departmentFootballId: string;
let departmentTennisId: string;
let teamE1Id: string;
let venueId: string;

interface AuthedMember {
  cookie: string;
  personId: string;
  userId: string;
}

const cleanupUserIds: string[] = [];
const cleanupTournamentIds: string[] = [];

async function createAuthenticatedMember(
  tenantId: string,
  label: string,
  roleAssignments: Array<{ role: string; scopeType: "TENANT" | "DEPARTMENT" | "TEAM"; departmentId?: string; teamId?: string }>,
): Promise<AuthedMember> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  const password = "Sup3rSicher!Test";

  const signupResponse = await request(server).post("/api/auth/sign-up/email").send({ email, password, name: label });
  const setCookie = signupResponse.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);

  const dbUser = await adminPrisma.user.findUniqueOrThrow({ where: { email } });
  cleanupUserIds.push(dbUser.id);

  const db = getTenantPrisma(tenantId);
  const person = await db.person.create({ data: { tenantId, firstName: label, lastName: "Test" } });
  await adminPrisma.membership.create({ data: { userId: dbUser.id, personId: person.id, status: "ACTIVE" } });

  for (const ra of roleAssignments) {
    await db.roleAssignment.create({
      data: { tenantId, personId: person.id, role: ra.role as never, scopeType: ra.scopeType, departmentId: ra.departmentId, teamId: ra.teamId },
    });
  }
  return { cookie, personId: person.id, userId: dbUser.id };
}

/** Builds a committed knockout bracket (4 or 8 external participants) via the real preview/commit flow, returns the participant ids in seed order and the committed matches. */
async function createCommittedBracket(cookie: string, tenantId: string, options: { participantCount: 4 | 8; includeThirdPlace?: boolean } = { participantCount: 4 }) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tournamentResponse = await request(server)
    .post("/api/v1/football/tournaments")
    .set("Cookie", cookie)
    .set("X-Tenant-Id", tenantId)
    .send({ departmentId: departmentFootballId, name: `Slot Resolution Cup ${suffix}`, mode: "KNOCKOUT", startsAt: "2026-12-05T09:00:00.000Z", endsAt: "2026-12-05T22:00:00.000Z" });
  const tournamentId = tournamentResponse.body.id as string;
  cleanupTournamentIds.push(tournamentId);

  const participantIds: string[] = [];
  for (let i = 0; i < options.participantCount; i++) {
    const participantResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/participants`)
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId)
      .send({ externalName: `Slot Test Team ${suffix}-${i}` });
    participantIds.push(participantResponse.body.id as string);
  }
  await request(server).post(`/api/v1/football/tournaments/${tournamentId}/venues`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send({ venueId });

  const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));
  const settings = {
    entrants,
    includeThirdPlace: options.includeThirdPlace ?? false,
    matchDurationMinutes: 10,
    changeoverMinutes: 2,
    minimumRestMinutes: 10,
    venueIds: [venueId],
  };
  const preview = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send(settings);
  const commit = await request(server)
    .post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`)
    .set("Cookie", cookie)
    .set("X-Tenant-Id", tenantId)
    .send({ ...settings, fingerprint: preview.body.fingerprint });
  expect(commit.status).toBe(201);

  const matches = await adminPrisma.footballMatch.findMany({ where: { tournamentId }, orderBy: { startsAt: "asc" } });
  return { tournamentId, participantIds, matches };
}

async function patchMatch(cookie: string, tenantId: string, matchId: string, body: Record<string, unknown>) {
  return request(server).patch(`/api/v1/football/matches/${matchId}`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send(body);
}

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressInstance = app.getHttpAdapter().getInstance();
  expressInstance.all("/api/auth/{*splat}", toNodeHandler(auth));
  const express = await import("express");
  app.use(express.default.json());

  app.setGlobalPrefix("api", { exclude: [{ path: "health", method: RequestMethod.GET }, { path: "health/ready", method: RequestMethod.GET }] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  await app.init();
  server = app.getHttpServer();

  const tenantA = await adminPrisma.tenant.create({ data: { name: "Slot Resolution API Test Tenant A", slug: `slot-resolution-api-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Slot Resolution API Test Tenant B", slug: `slot-resolution-api-b-${Date.now()}` } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({ data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" } });
  const tennis = await dbA.department.create({ data: { tenantId: tenantAId, name: "Tennis", sportType: "TENNIS" } });
  departmentFootballId = football.id;
  departmentTennisId = tennis.id;

  const e1 = await dbA.team.create({ data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E1" } });
  teamE1Id = e1.id;

  const venue = await dbA.venue.create({ data: { tenantId: tenantAId, name: "Sportplatz Test" } });
  venueId = venue.id;

  const dbB = getTenantPrisma(tenantBId);
  await dbB.department.create({ data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" } });
});

afterAll(async () => {
  await adminPrisma.tournamentMatchSlot.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentParticipant.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentVenue.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballTournament.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.venue.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("Slot resolution — WinnerOfMatch (4-team bracket)", () => {
  it("finalizing SF1 resolves the Final's HOME slot; AWAY stays pending until SF2 is finalized", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-sf1", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds, matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1, sf2] = matches; // startsAt asc: SF-1, SF-2, then FINAL

    const response = await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    expect(response.status).toBe(200);

    const finalMatch = await adminPrisma.footballMatch.findFirstOrThrow({ where: { tournamentId, id: { notIn: [sf1!.id, sf2!.id] } } });
    expect(finalMatch.homeParticipantId).toBe(participantIds[0]); // SF1 home (seed 1) won
    expect(finalMatch.awayParticipantId).toBeNull();

    const remainingSlots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalMatch.id } });
    expect(remainingSlots).toHaveLength(1);
    expect(remainingSlots[0]!.side).toBe("AWAY");
  });

  it("finalizing both semifinals resolves the Final completely, in either order", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-both-sf", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds, matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1, sf2] = matches;

    // Standard seeding for 4 entrants: SF-1 = seed1 v seed4, SF-2 = seed2 v
    // seed3 (computeSeedOrder(4) = [1,4,2,3]) — SF-2's away side is seed 3
    // (participantIds[2]), not seed 4.
    await patchMatch(admin.cookie, tenantAId, sf2!.id, { status: "COMPLETED", homeScore: 0, awayScore: 3 }); // away wins (seed 3)
    await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 }); // home wins (seed 1)

    const finalMatch = await adminPrisma.footballMatch.findFirstOrThrow({ where: { tournamentId, id: { notIn: [sf1!.id, sf2!.id] } } });
    expect(finalMatch.homeParticipantId).toBe(participantIds[0]);
    expect(finalMatch.awayParticipantId).toBe(participantIds[2]);
    const remainingSlots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalMatch.id } });
    expect(remainingSlots).toHaveLength(0);
  });

  it("the resolved Final now shows the real team name via GET, replacing the pending label", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-label", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1, , finalMatch] = matches;

    const beforeResponse = await request(server).get(`/api/v1/football/matches/${finalMatch!.id}`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    expect(beforeResponse.body.homeParticipantName).toBe("Sieger (steht noch nicht fest)");

    await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });

    const afterResponse = await request(server).get(`/api/v1/football/matches/${finalMatch!.id}`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    expect(afterResponse.body.homeParticipantName).toMatch(/^Slot Test Team /);
  });
});

describe("Slot resolution — LoserOfMatch (Spiel um Platz 3)", () => {
  it("finalizing both semifinals resolves the third-place match with the losers", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-third", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds, matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4, includeThirdPlace: true });
    const [sf1, sf2] = matches;

    // SF-1 = seed1 v seed4, SF-2 = seed2 v seed3 (see computeSeedOrder(4)).
    await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 }); // loser = away = seed 4
    await patchMatch(admin.cookie, tenantAId, sf2!.id, { status: "COMPLETED", homeScore: 0, awayScore: 3 }); // loser = home = seed 2

    const allTournamentMatches = await adminPrisma.footballMatch.findMany({ where: { tournamentId } });
    const thirdPlaceMatch = allTournamentMatches.find((m) => m.id !== sf1!.id && m.id !== sf2!.id && (m.homeParticipantId === participantIds[1] || m.awayParticipantId === participantIds[1]));
    expect(thirdPlaceMatch).toBeDefined();
    expect([thirdPlaceMatch!.homeParticipantId, thirdPlaceMatch!.awayParticipantId].sort()).toEqual([participantIds[1], participantIds[3]].sort());
  });
});

describe("Slot resolution — 8-team cascade", () => {
  it("Viertelfinale -> Halbfinale -> Finale resolves correctly across all rounds", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-8team", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds, matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 8 });
    // startsAt asc: QF-1..QF-4, SF-1, SF-2, FINAL (7 matches total).
    const [qf1, qf2, qf3, qf4] = matches;

    // Seed pairing for 8: QF1=1v8, QF2=4v5, QF3=2v7, QF4=3v6 (Phase 13 standard seeding).
    await patchMatch(admin.cookie, tenantAId, qf1!.id, { status: "COMPLETED", homeScore: 3, awayScore: 0 }); // seed1 wins
    await patchMatch(admin.cookie, tenantAId, qf2!.id, { status: "COMPLETED", homeScore: 1, awayScore: 2 }); // seed5 wins
    await patchMatch(admin.cookie, tenantAId, qf3!.id, { status: "COMPLETED", homeScore: 2, awayScore: 0 }); // seed2 wins
    await patchMatch(admin.cookie, tenantAId, qf4!.id, { status: "COMPLETED", homeScore: 0, awayScore: 1 }); // seed6 wins

    const afterQfMatches = await adminPrisma.footballMatch.findMany({ where: { tournamentId }, orderBy: { startsAt: "asc" } });
    const semifinals = afterQfMatches.filter((m) => ![qf1!.id, qf2!.id, qf3!.id, qf4!.id].includes(m.id) && m.homeParticipantId !== null && m.awayParticipantId !== null);
    expect(semifinals).toHaveLength(2); // both semifinals fully resolved from the quarterfinal results

    const sf1 = semifinals.find((m) => m.homeParticipantId === participantIds[0] || m.awayParticipantId === participantIds[0]);
    expect(sf1).toBeDefined();
    expect([sf1!.homeParticipantId, sf1!.awayParticipantId].sort()).toEqual([participantIds[0], participantIds[4]].sort());

    await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: sf1!.homeParticipantId === participantIds[0] ? 2 : 1, awayScore: sf1!.homeParticipantId === participantIds[0] ? 1 : 2 });
    const sf2 = semifinals.find((m) => m.id !== sf1!.id)!;
    await patchMatch(admin.cookie, tenantAId, sf2.id, { status: "COMPLETED", homeScore: sf2.homeParticipantId === participantIds[1] ? 2 : 1, awayScore: sf2.homeParticipantId === participantIds[1] ? 1 : 2 });

    const finalMatch = await adminPrisma.footballMatch.findFirstOrThrow({
      where: { tournamentId, id: { notIn: [qf1!.id, qf2!.id, qf3!.id, qf4!.id, sf1!.id, sf2.id] } },
    });
    expect(finalMatch.homeParticipantId).toBe(participantIds[0]); // seed 1 carried through QF1 -> SF1 -> FINAL
    expect(finalMatch.awayParticipantId).toBe(participantIds[1]); // seed 2 carried through QF3 -> SF2 -> FINAL

    // No further pending slots anywhere in the tournament once the Final itself has no dependents.
    const remainingSlots = await adminPrisma.tournamentMatchSlot.findMany({ where: { tournamentId } });
    expect(remainingSlots).toHaveLength(0);
  });
});

describe("Slot resolution — draws, idempotency, result changes", () => {
  it("a draw does not resolve the dependent slot and returns 200 (not an error)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-draw", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1, , finalMatch] = matches;

    const response = await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 1, awayScore: 1 });
    expect(response.status).toBe(200);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatch!.id } });
    expect(final.homeParticipantId).toBeNull();
    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalMatch!.id, side: "HOME" } });
    expect(slots).toHaveLength(1);
  });

  it("re-submitting the identical result twice is idempotent — no duplicate resolution, no error", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-idempotent", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { participantIds, matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1, , finalMatch] = matches;

    const first = await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    expect(first.status).toBe(200);
    const second = await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    expect(second.status).toBe(200);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatch!.id } });
    expect(final.homeParticipantId).toBe(participantIds[0]);
    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalMatch!.id } });
    expect(slots).toHaveLength(1); // still exactly one (AWAY) — no duplicate rows from the repeat
  });

  it("changing an already-propagated result is rejected (409) and leaves the downstream match untouched", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-change", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { participantIds, matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1, , finalMatch] = matches;

    await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    const change = await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 1, awayScore: 3 }); // flips the winner
    expect(change.status).toBe(409);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatch!.id } });
    expect(final.homeParticipantId).toBe(participantIds[0]); // unchanged — still the original winner
  });

  it("editing venue/notes on an already-propagated match is still allowed (only status/scores are locked)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-editable-fields", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1] = matches;

    await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    const response = await patchMatch(admin.cookie, tenantAId, sf1!.id, { notes: "Nachträglich ergänzte Anmerkung" });
    expect(response.status).toBe(200);
    expect(response.body.notes).toBe("Nachträglich ergänzte Anmerkung");
  });

  it("a completed match with no dependents (the Final itself) can still have its score corrected freely", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-final-editable", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1, sf2, finalMatch] = matches;
    await patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    await patchMatch(admin.cookie, tenantAId, sf2!.id, { status: "COMPLETED", homeScore: 0, awayScore: 2 });

    const first = await patchMatch(admin.cookie, tenantAId, finalMatch!.id, { status: "COMPLETED", homeScore: 3, awayScore: 1 });
    expect(first.status).toBe(200);
    const corrected = await patchMatch(admin.cookie, tenantAId, finalMatch!.id, { status: "COMPLETED", homeScore: 2, awayScore: 2 });
    expect(corrected.status).toBe(200); // allowed — the Final has no dependents, resultPropagatedAt was never set
  });
});

describe("Slot resolution — concurrency", () => {
  it("two near-simultaneous finalizations of the two DIFFERENT semifinals both resolve the shared Final correctly", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-concurrent-diff", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { participantIds, matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1, sf2, finalMatch] = matches;

    const [r1, r2] = await Promise.all([
      patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 }),
      patchMatch(admin.cookie, tenantAId, sf2!.id, { status: "COMPLETED", homeScore: 0, awayScore: 3 }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // SF-2 = seed2 v seed3 (see computeSeedOrder(4)) — away wins -> seed 3.
    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatch!.id } });
    expect(final.homeParticipantId).toBe(participantIds[0]);
    expect(final.awayParticipantId).toBe(participantIds[2]);
  });

  it("two near-simultaneous, identical finalizations of the SAME match are serialized safely — no duplicate resolution", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-concurrent-same", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { participantIds, matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1, , finalMatch] = matches;

    const [r1, r2] = await Promise.all([
      patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 }),
      patchMatch(admin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatch!.id } });
    expect(final.homeParticipantId).toBe(participantIds[0]);
    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { matchId: finalMatch!.id } });
    expect(slots).toHaveLength(1);
  });
});

describe("Slot resolution — authorization", () => {
  it("DEPARTMENT_ADMIN of a DIFFERENT department cannot finalize a match (403), no resolution happens", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-authz-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const tennisAdmin = await createAuthenticatedMember(tenantAId, "tennis-admin-slot-authz", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentTennisId }]);
    const { matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1] = matches;

    const response = await patchMatch(tennisAdmin.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    expect(response.status).toBe(403);
    const sf1After = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: sf1!.id } });
    expect(sf1After.status).toBe("SCHEDULED");
  });

  it("COACH cannot finalize a tournament match (403), no resolution happens", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-coach-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-slot", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const { matches } = await createCommittedBracket(admin.cookie, tenantAId, { participantCount: 4 });
    const [sf1] = matches;

    const response = await patchMatch(coach.cookie, tenantAId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    expect(response.status).toBe(403);
  });
});

describe("Slot resolution — cross-tenant isolation", () => {
  it("Tenant B cannot see or finalize Tenant A's match", async () => {
    const adminA = await createAuthenticatedMember(tenantAId, "tenant-admin-slot-cross-a", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const adminB = await createAuthenticatedMember(tenantBId, "tenant-admin-slot-cross-b", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { matches } = await createCommittedBracket(adminA.cookie, tenantAId, { participantCount: 4 });
    const [sf1] = matches;

    const response = await patchMatch(adminB.cookie, tenantBId, sf1!.id, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    expect(response.status).toBe(404); // RLS: tenant B simply can't find tenant A's match

    const sf1After = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: sf1!.id } });
    expect(sf1After.status).toBe("SCHEDULED");
  });
});
