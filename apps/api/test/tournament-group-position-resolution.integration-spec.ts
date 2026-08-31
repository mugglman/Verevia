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
 * End-to-end verification of Phase 16's group standings / GROUP_POSITION
 * slot resolution against a real PostgreSQL instance and real better-auth
 * sessions. Drives the REAL, complete intended production flow for a
 * combined GROUPS_AND_KNOCKOUT tournament: commit a knockout bracket whose
 * entrants reference GROUP_POSITION sources (Phase 13's KnockoutEntrantDto
 * already supports this — no new capability needed), add that group's own
 * matches individually (see createSingleGroupWithFinal for why — Phase
 * 12/13's round-robin generator can't be combined with an already-committed
 * KO bracket on the same tournament, a deliberate, unrelated V1 decision),
 * then finalize group matches via the existing PATCH /football/matches/:id
 * (Phase 15) and verify the knockout slots resolve automatically. Not part
 * of `pnpm test`/CI (no DB there). Run via `pnpm test:integration`.
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

async function patchMatch(cookie: string, tenantId: string, matchId: string, body: Record<string, unknown>) {
  return request(server).patch(`/api/v1/football/matches/${matchId}`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send(body);
}

/**
 * Builds a real "GROUPS_AND_KNOCKOUT" tournament: a knockout Final whose
 * two sides are GROUP_POSITION entrants (position 1 / position 2 of a
 * group) committed via the real KO generator (Phase 13), plus that
 * group's round-robin matches.
 *
 * Ordering matters here: `TournamentScheduleService.commit` and
 * `TournamentKnockoutService.commit` both deliberately reject once ANY
 * match already exists for the tournament ("ein Turnier hat höchstens
 * EINEN Spielplan insgesamt, egal ob Round-Robin oder KO" — a considered
 * Phase 12/13 V1 decision, see PHASE_12/PHASE_13 reports; not something
 * Phase 16 touches). So a combined GROUPS_AND_KNOCKOUT tournament cannot
 * get its group matches from the round-robin auto-generator once a KO
 * bracket already exists — the KO bracket is committed FIRST (while zero
 * matches exist), and the group's own matches are added individually via
 * the plain manual tournament-match endpoint (`POST
 * /tournaments/:id/matches`, unrelated to and unguarded by the generators'
 * "one schedule" rule) exactly as a V1 GROUPS_AND_KNOCKOUT tournament is
 * actually meant to be built today.
 */
async function createSingleGroupWithFinal(cookie: string, tenantId: string, groupSize: 3 | 4 = 3) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tournamentResponse = await request(server)
    .post("/api/v1/football/tournaments")
    .set("Cookie", cookie)
    .set("X-Tenant-Id", tenantId)
    .send({ departmentId: departmentFootballId, name: `Group Resolution Cup ${suffix}`, mode: "GROUPS_AND_KNOCKOUT", startsAt: "2026-12-05T09:00:00.000Z", endsAt: "2026-12-05T22:00:00.000Z" });
  const tournamentId = tournamentResponse.body.id as string;
  cleanupTournamentIds.push(tournamentId);

  const groupResponse = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/groups`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send({ name: "Gruppe A" });
  const groupId = groupResponse.body.id as string;

  const participantIds: string[] = [];
  for (let i = 0; i < groupSize; i++) {
    const participantResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/participants`)
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId)
      .send({ externalName: `Group Test Team ${suffix}-${i}` });
    const participantId = participantResponse.body.id as string;
    participantIds.push(participantId);
    await request(server).patch(`/api/v1/football/tournaments/${tournamentId}/participants/${participantId}`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send({ groupId });
  }
  await request(server).post(`/api/v1/football/tournaments/${tournamentId}/venues`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send({ venueId });

  const koSettings = {
    entrants: [
      { type: "GROUP_POSITION", groupId, position: 1 },
      { type: "GROUP_POSITION", groupId, position: 2 },
    ],
    includeThirdPlace: false,
    matchDurationMinutes: 10,
    changeoverMinutes: 2,
    minimumRestMinutes: 10,
    venueIds: [venueId],
    schedulingStartsAt: "2026-12-05T15:00:00.000Z",
  };
  const koPreview = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send(koSettings);
  expect(koPreview.status).toBe(200);
  const koCommit = await request(server)
    .post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`)
    .set("Cookie", cookie)
    .set("X-Tenant-Id", tenantId)
    .send({ ...koSettings, fingerprint: koPreview.body.fingerprint });
  expect(koCommit.status).toBe(201);

  const groupMatchIds: string[] = [];
  let matchOffsetMinutes = 0;
  for (let i = 0; i < participantIds.length; i++) {
    for (let j = i + 1; j < participantIds.length; j++) {
      const startsAt = new Date(Date.parse("2026-12-05T09:00:00.000Z") + matchOffsetMinutes * 60_000).toISOString();
      matchOffsetMinutes += 20;
      const matchResponse = await request(server)
        .post(`/api/v1/football/tournaments/${tournamentId}/matches`)
        .set("Cookie", cookie)
        .set("X-Tenant-Id", tenantId)
        .send({
          venueId,
          tournamentGroupId: groupId,
          homeParticipantId: participantIds[i],
          awayParticipantId: participantIds[j],
          startsAt,
          type: "TOURNAMENT",
          homeAway: "HOME",
        });
      expect(matchResponse.status).toBe(201);
      groupMatchIds.push(matchResponse.body.id as string);
    }
  }
  const groupMatches = await adminPrisma.footballMatch.findMany({ where: { id: { in: groupMatchIds } }, orderBy: { startsAt: "asc" } });
  const finalMatch = await adminPrisma.footballMatch.findFirstOrThrow({ where: { tournamentId, tournamentGroupId: null } });

  return { tournamentId, groupId, participantIds, groupMatches, finalMatchId: finalMatch.id };
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

  const tenantA = await adminPrisma.tenant.create({ data: { name: "Group Resolution API Test Tenant A", slug: `group-resolution-api-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Group Resolution API Test Tenant B", slug: `group-resolution-api-b-${Date.now()}` } });
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
  await adminPrisma.tournamentGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
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

describe("Group standings — GET /tournaments/:id/groups", () => {
  it("shows an interim table (not complete) after some but not all group matches finish", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-interim", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, groupMatches } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);

    await patchMatch(admin.cookie, tenantAId, groupMatches[0]!.id, { status: "COMPLETED", homeScore: 2, awayScore: 0 });

    const response = await request(server).get(`/api/v1/football/tournaments/${tournamentId}/groups`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    const group = response.body[0];
    expect(group.isComplete).toBe(false);
    expect(group.standings.length).toBe(3);
    expect(group.standings.some((row: { played: number }) => row.played > 0)).toBe(true);
  });

  it("shows the final table (isComplete) once every group match is finished", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-final-table", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, groupMatches } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);

    for (const m of groupMatches) {
      await patchMatch(admin.cookie, tenantAId, m.id, { status: "COMPLETED", homeScore: 1, awayScore: 0 });
    }

    const response = await request(server).get(`/api/v1/football/tournaments/${tournamentId}/groups`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    const group = response.body[0];
    expect(group.isComplete).toBe(true);
    expect(group.standings.every((row: { played: number }) => row.played === 2)).toBe(true);
  });
});

describe("GROUP_POSITION resolution — one group feeding the Final", () => {
  it("does not resolve the Final's slots before the group is complete", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-not-yet", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { groupMatches, finalMatchId } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);

    await patchMatch(admin.cookie, tenantAId, groupMatches[0]!.id, { status: "COMPLETED", homeScore: 3, awayScore: 0 });

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatchId } });
    expect(final.homeParticipantId).toBeNull();
    expect(final.awayParticipantId).toBeNull();
  });

  it("resolves both Final slots once the group's last match completes", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-last-match", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { participantIds, groupMatches, finalMatchId } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);

    // Team 0 wins both its matches -> clear group winner regardless of the third match's outcome.
    const match0v1 = groupMatches.find((m) => [m.homeParticipantId, m.awayParticipantId].includes(participantIds[0]!) && [m.homeParticipantId, m.awayParticipantId].includes(participantIds[1]!))!;
    const match0v2 = groupMatches.find((m) => [m.homeParticipantId, m.awayParticipantId].includes(participantIds[0]!) && [m.homeParticipantId, m.awayParticipantId].includes(participantIds[2]!))!;
    const match1v2 = groupMatches.find((m) => m.id !== match0v1.id && m.id !== match0v2.id)!;

    await patchMatch(admin.cookie, tenantAId, match0v1.id, match0v1.homeParticipantId === participantIds[0] ? { status: "COMPLETED", homeScore: 2, awayScore: 0 } : { status: "COMPLETED", homeScore: 0, awayScore: 2 });
    await patchMatch(admin.cookie, tenantAId, match1v2.id, { status: "COMPLETED", homeScore: 1, awayScore: 1 });
    const response = await patchMatch(admin.cookie, tenantAId, match0v2.id, match0v2.homeParticipantId === participantIds[0] ? { status: "COMPLETED", homeScore: 3, awayScore: 0 } : { status: "COMPLETED", homeScore: 0, awayScore: 3 });
    expect(response.status).toBe(200);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatchId } });
    expect(final.homeParticipantId).toBe(participantIds[0]); // group winner
    expect(final.awayParticipantId).not.toBeNull(); // runner-up resolved too
    expect(final.awayParticipantId).not.toBe(participantIds[0]);
  });

  it("re-finalizing the group's last match with the identical result is idempotent — no error, no duplicate resolution", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-idempotent", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { groupId, participantIds, groupMatches, finalMatchId } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);
    for (let i = 0; i < groupMatches.length - 1; i++) {
      await patchMatch(admin.cookie, tenantAId, groupMatches[i]!.id, { status: "COMPLETED", homeScore: 1, awayScore: 0 });
    }
    const lastMatch = groupMatches[groupMatches.length - 1]!;
    const first = await patchMatch(admin.cookie, tenantAId, lastMatch.id, { status: "COMPLETED", homeScore: 1, awayScore: 0 });
    expect(first.status).toBe(200);
    const second = await patchMatch(admin.cookie, tenantAId, lastMatch.id, { status: "COMPLETED", homeScore: 1, awayScore: 0 });
    expect(second.status).toBe(200);

    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { groupId } });
    expect(slots).toHaveLength(0);
    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatchId } });
    expect(final.homeParticipantId).not.toBeNull();
    void participantIds;
  });

  it("locks every group match once resolved — a later correction attempt is rejected (409)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-locked", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { groupMatches } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);
    for (const m of groupMatches) {
      await patchMatch(admin.cookie, tenantAId, m.id, { status: "COMPLETED", homeScore: 1, awayScore: 0 });
    }
    const correction = await patchMatch(admin.cookie, tenantAId, groupMatches[0]!.id, { status: "COMPLETED", homeScore: 4, awayScore: 0 });
    expect(correction.status).toBe(409);
  });
});

describe("GROUP_POSITION resolution — concurrency", () => {
  it("the group's last two matches finalized nearly simultaneously still resolve exactly once, correctly", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-concurrent", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { groupId, participantIds, groupMatches, finalMatchId } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);

    const match0v1 = groupMatches.find((m) => [m.homeParticipantId, m.awayParticipantId].includes(participantIds[0]!) && [m.homeParticipantId, m.awayParticipantId].includes(participantIds[1]!))!;
    const match0v2 = groupMatches.find((m) => [m.homeParticipantId, m.awayParticipantId].includes(participantIds[0]!) && [m.homeParticipantId, m.awayParticipantId].includes(participantIds[2]!))!;
    const match1v2 = groupMatches.find((m) => m.id !== match0v1.id && m.id !== match0v2.id)!;

    // Complete one match up front, then finalize the group's last TWO matches concurrently.
    await patchMatch(admin.cookie, tenantAId, match0v1.id, match0v1.homeParticipantId === participantIds[0] ? { status: "COMPLETED", homeScore: 2, awayScore: 0 } : { status: "COMPLETED", homeScore: 0, awayScore: 2 });

    const [r1, r2] = await Promise.all([
      patchMatch(admin.cookie, tenantAId, match0v2.id, match0v2.homeParticipantId === participantIds[0] ? { status: "COMPLETED", homeScore: 3, awayScore: 0 } : { status: "COMPLETED", homeScore: 0, awayScore: 3 }),
      patchMatch(admin.cookie, tenantAId, match1v2.id, { status: "COMPLETED", homeScore: 1, awayScore: 1 }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatchId } });
    expect(final.homeParticipantId).toBe(participantIds[0]);
    expect(final.awayParticipantId).not.toBeNull();
    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { groupId } });
    expect(slots).toHaveLength(0);
  });
});

describe("GROUP_POSITION resolution — existing propagation regression", () => {
  it("WinnerOfMatch/LoserOfMatch propagation (Phase 14) still works unchanged alongside GROUP_POSITION", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-plus-knockout", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { groupMatches, finalMatchId } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);
    for (const m of groupMatches) {
      await patchMatch(admin.cookie, tenantAId, m.id, { status: "COMPLETED", homeScore: 1, awayScore: 0 });
    }
    const final = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: finalMatchId } });
    expect(final.homeParticipantId).not.toBeNull();
    expect(final.awayParticipantId).not.toBeNull();

    // The Final itself has no downstream dependents, so its own result
    // remains freely correctable (Phase 14 behavior, unaffected by Phase 16).
    const finalResult = await patchMatch(admin.cookie, tenantAId, finalMatchId, { status: "COMPLETED", homeScore: 2, awayScore: 1 });
    expect(finalResult.status).toBe(200);
    const finalCorrection = await patchMatch(admin.cookie, tenantAId, finalMatchId, { status: "COMPLETED", homeScore: 3, awayScore: 1 });
    expect(finalCorrection.status).toBe(200);
  });
});

describe("GROUP_POSITION resolution — authorization", () => {
  it("DEPARTMENT_ADMIN of a DIFFERENT department cannot finalize a group match (403), no resolution happens", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-authz-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const tennisAdmin = await createAuthenticatedMember(tenantAId, "tennis-admin-group-authz", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentTennisId }]);
    const { groupMatches } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);

    const response = await patchMatch(tennisAdmin.cookie, tenantAId, groupMatches[0]!.id, { status: "COMPLETED", homeScore: 2, awayScore: 0 });
    expect(response.status).toBe(403);
    const match = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: groupMatches[0]!.id } });
    expect(match.status).toBe("SCHEDULED");
  });

  it("COACH cannot finalize a group match (403)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-coach-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-group", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const { groupMatches } = await createSingleGroupWithFinal(admin.cookie, tenantAId, 3);

    const response = await patchMatch(coach.cookie, tenantAId, groupMatches[0]!.id, { status: "COMPLETED", homeScore: 2, awayScore: 0 });
    expect(response.status).toBe(403);
  });
});

describe("GROUP_POSITION resolution — cross-tenant isolation", () => {
  it("Tenant B cannot see or finalize Tenant A's group match", async () => {
    const adminA = await createAuthenticatedMember(tenantAId, "tenant-admin-group-cross-a", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const adminB = await createAuthenticatedMember(tenantBId, "tenant-admin-group-cross-b", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { groupMatches } = await createSingleGroupWithFinal(adminA.cookie, tenantAId, 3);

    const response = await patchMatch(adminB.cookie, tenantBId, groupMatches[0]!.id, { status: "COMPLETED", homeScore: 2, awayScore: 0 });
    expect(response.status).toBe(404);
    const match = await adminPrisma.footballMatch.findUniqueOrThrow({ where: { id: groupMatches[0]!.id } });
    expect(match.status).toBe("SCHEDULED");
  });
});
