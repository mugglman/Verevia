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
 * End-to-end verification of the Phase 12 tournament schedule generator
 * (preview/commit) against a real PostgreSQL instance and real better-auth
 * sessions. Not part of `pnpm test`/CI (no DB there), same reasoning as
 * tournament-core.integration-spec.ts. Run via `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let departmentFootballId: string;
let departmentTennisId: string;
let teamE1Id: string;
let seasonFootballId: string;
let ageGroupId: string;
let teamSeasonE1Id: string;
let venueId: string;
let venueUnassignedId: string;

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
  roleAssignments: Array<{
    role: string;
    scopeType: "TENANT" | "DEPARTMENT" | "TEAM";
    departmentId?: string;
    teamId?: string;
  }>,
): Promise<AuthedMember> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  const password = "Sup3rSicher!Test";

  const signupResponse = await request(server)
    .post("/api/auth/sign-up/email")
    .send({ email, password, name: label });
  const setCookie = signupResponse.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);

  const dbUser = await adminPrisma.user.findUniqueOrThrow({ where: { email } });
  cleanupUserIds.push(dbUser.id);

  const db = getTenantPrisma(tenantId);
  const person = await db.person.create({
    data: { tenantId, firstName: label, lastName: "Test" },
  });
  await adminPrisma.membership.create({
    data: { userId: dbUser.id, personId: person.id, status: "ACTIVE" },
  });

  for (const ra of roleAssignments) {
    await db.roleAssignment.create({
      data: {
        tenantId,
        personId: person.id,
        role: ra.role as never,
        scopeType: ra.scopeType,
        departmentId: ra.departmentId,
        teamId: ra.teamId,
      },
    });
  }

  return { cookie, personId: person.id, userId: dbUser.id };
}

function defaultSettings(overrides: Partial<{ matchDurationMinutes: number; changeoverMinutes: number; minimumRestMinutes: number; venueIds: string[] }> = {}) {
  return {
    matchDurationMinutes: 10,
    changeoverMinutes: 2,
    minimumRestMinutes: 10,
    venueIds: [venueId],
    ...overrides,
  };
}

/** Creates a fully schedulable tournament (participants grouped, venue assigned) via the real API. */
async function createSchedulableTournament(
  cookie: string,
  options: { participantCount?: number; mode?: string; skipGrouping?: boolean; assignVenue?: boolean } = {},
) {
  const { participantCount = 4, mode = "GROUPS", skipGrouping = false, assignVenue = true } = options;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const tournamentResponse = await request(server)
    .post("/api/v1/football/tournaments")
    .set("Cookie", cookie)
    .set("X-Tenant-Id", tenantAId)
    .send({
      departmentId: departmentFootballId,
      name: `Schedule Test Cup ${suffix}`,
      mode,
      startsAt: "2026-12-05T09:00:00.000Z",
      endsAt: "2026-12-05T20:00:00.000Z",
    });
  const tournamentId = tournamentResponse.body.id as string;
  cleanupTournamentIds.push(tournamentId);

  const groupResponse = await request(server)
    .post(`/api/v1/football/tournaments/${tournamentId}/groups`)
    .set("Cookie", cookie)
    .set("X-Tenant-Id", tenantAId)
    .send({ name: "Gruppe A" });
  const groupId = groupResponse.body.id as string;

  const participantIds: string[] = [];
  for (let i = 0; i < participantCount; i++) {
    const participantResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/participants`)
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: `Schedule Test Team ${suffix}-${i}` });
    const participantId = participantResponse.body.id as string;
    participantIds.push(participantId);

    if (!skipGrouping) {
      await request(server)
        .patch(`/api/v1/football/tournaments/${tournamentId}/participants/${participantId}`)
        .set("Cookie", cookie)
        .set("X-Tenant-Id", tenantAId)
        .send({ groupId });
    }
  }

  if (assignVenue) {
    await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/venues`)
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ venueId });
  }

  return { tournamentId, groupId, participantIds };
}

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressInstance = app.getHttpAdapter().getInstance();
  expressInstance.all("/api/auth/{*splat}", toNodeHandler(auth));
  const express = await import("express");
  app.use(express.default.json());

  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  server = app.getHttpServer();

  const tenantA = await adminPrisma.tenant.create({
    data: { name: "Schedule Generator API Test Tenant A", slug: `schedule-generator-api-a-${Date.now()}` },
  });
  tenantAId = tenantA.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({
    data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" },
  });
  const tennis = await dbA.department.create({
    data: { tenantId: tenantAId, name: "Tennis", sportType: "TENNIS" },
  });
  departmentFootballId = football.id;
  departmentTennisId = tennis.id;

  const e1 = await dbA.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E1" },
  });
  teamE1Id = e1.id;

  const seasonFootball = await dbA.season.create({
    data: {
      tenantId: tenantAId,
      departmentId: departmentFootballId,
      name: "2026/2027",
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2027-06-30"),
      status: "ACTIVE",
    },
  });
  seasonFootballId = seasonFootball.id;

  const ageGroup = await dbA.ageGroup.create({
    data: { tenantId: tenantAId, name: "E-Jugend", sortOrder: 1 },
  });
  ageGroupId = ageGroup.id;

  const teamSeasonE1 = await dbA.teamSeason.create({
    data: { tenantId: tenantAId, teamId: teamE1Id, seasonId: seasonFootballId, ageGroupId },
  });
  teamSeasonE1Id = teamSeasonE1.id;

  const venue = await dbA.venue.create({ data: { tenantId: tenantAId, name: "Sportplatz Test" } });
  venueId = venue.id;
  const venueUnassigned = await dbA.venue.create({ data: { tenantId: tenantAId, name: "Sportplatz Unassigned" } });
  venueUnassignedId = venueUnassigned.id;
});

afterAll(async () => {
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.tournamentParticipant.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.tournamentGroup.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.tournamentVenue.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.footballTournament.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.venue.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.teamSeason.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.ageGroup.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.season.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.person.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.department.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.tenant.deleteMany({ where: { id: tenantAId } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("Schedule preview/commit — auth baseline", () => {
  it("POST preview without a session → 401", async () => {
    const response = await request(server)
      .post("/api/v1/football/tournaments/00000000-0000-0000-0000-000000000000/schedule/preview")
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(response.status).toBe(401);
  });

  it("POST commit without a session → 401", async () => {
    const response = await request(server)
      .post("/api/v1/football/tournaments/00000000-0000-0000-0000-000000000000/schedule/commit")
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings(), fingerprint: "x" });
    expect(response.status).toBe(401);
  });
});

describe("Schedule preview/commit — authorization", () => {
  it("TENANT_ADMIN can preview and commit", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie);

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.body.valid).toBe(true);
    expect(previewResponse.body.matches).toHaveLength(6); // 4 participants → 6 matches

    const commitResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings(), fingerprint: previewResponse.body.fingerprint });
    expect(commitResponse.status).toBe(201);
    expect(commitResponse.body.createdMatchCount).toBe(6);
  });

  it("DEPARTMENT_ADMIN Fußball can preview and commit in their own department", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-schedule", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const { tournamentId } = await createSchedulableTournament(deptAdmin.cookie);

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(previewResponse.status).toBe(200);

    const commitResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings(), fingerprint: previewResponse.body.fingerprint });
    expect(commitResponse.status).toBe(201);
  });

  it("DEPARTMENT_ADMIN of a DIFFERENT department is forbidden", async () => {
    const tennisAdmin = await createAuthenticatedMember(tenantAId, "tennis-admin-schedule", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentTennisId },
    ]);
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-setup2", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie);

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", tennisAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(response.status).toBe(403);
  });

  it("COACH is forbidden from previewing and committing", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-setup3", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie);
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-schedule", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(previewResponse.status).toBe(403);

    const commitResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings(), fingerprint: "irrelevant" });
    expect(commitResponse.status).toBe(403);
  });
});

describe("Schedule preview", () => {
  it("creates 0 FootballMatch rows", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-preview-noop", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie);

    await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());

    const matchCount = await adminPrisma.footballMatch.count({ where: { tournamentId } });
    expect(matchCount).toBe(0);
  });

  it("is idempotent/deterministic for identical settings", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-deterministic", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie);

    const first = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    const second = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(second.body.fingerprint).toBe(first.body.fingerprint);
    expect(second.body.matches).toEqual(first.body.matches);
  });

  it("rejects a tournament in KNOCKOUT mode (400)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-knockout", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie, { mode: "KNOCKOUT" });

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/K\.-o\./);
  });

  it("rejects participants without a group (400)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-ungrouped", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie, { skipGrouping: true });

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(response.status).toBe(400);
  });

  it("rejects a venue not assigned to the tournament (400)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-wrong-venue", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie, { assignVenue: false });

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings({ venueIds: [venueUnassignedId] }));
    expect(response.status).toBe(400);
  });

  it("schedules successfully with a mix of internal (TeamSeason) and external participants", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-mixed", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie, { participantCount: 3 });

    const internalParticipant = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamSeasonId: teamSeasonE1Id });
    const groupResponse = await request(server)
      .get(`/api/v1/football/tournaments/${tournamentId}/groups`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    const groupId = groupResponse.body[0].id as string;
    await request(server)
      .patch(`/api/v1/football/tournaments/${tournamentId}/participants/${internalParticipant.body.id}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ groupId });

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.body.valid).toBe(true);
    expect(previewResponse.body.matches).toHaveLength(6); // 4 participants → 6 matches
    expect(previewResponse.body.matches.some((m: { homeParticipantName: string; awayParticipantName: string }) => m.homeParticipantName === "E1" || m.awayParticipantName === "E1")).toBe(true);
  });

  it("returns 404 for a non-existent tournament", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-404", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/football/tournaments/00000000-0000-0000-0000-000000000000/schedule/preview")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(response.status).toBe(404);
  });
});

describe("Schedule commit", () => {
  it("rejects a stale preview after the tournament state changed (409)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-stale", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId, groupId } = await createSchedulableTournament(admin.cookie);

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());

    // Change tournament state after the preview was taken — grouped
    // immediately so the new state still satisfies preconditions (a
    // structurally invalid state would 400 on its own, independent of
    // staleness; this test targets the fingerprint check specifically).
    await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: `Late Joiner ${Date.now()}`, groupId });

    const commitResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings(), fingerprint: previewResponse.body.fingerprint });
    expect(commitResponse.status).toBe(409);

    const matchCount = await adminPrisma.footballMatch.count({ where: { tournamentId } });
    expect(matchCount).toBe(0);
  });

  it("rejects committing a schedule when one already exists (409)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-existing", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie);

    const firstPreview = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    const firstCommit = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings(), fingerprint: firstPreview.body.fingerprint });
    expect(firstCommit.status).toBe(201);

    const secondPreview = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    const secondCommit = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings(), fingerprint: secondPreview.body.fingerprint });
    expect(secondCommit.status).toBe(409);

    const matchCount = await adminPrisma.footballMatch.count({ where: { tournamentId } });
    expect(matchCount).toBe(6);
  });

  it("persists matches with the correct fields (tournament mode, TOURNAMENT type, NEUTRAL, group)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-fields", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId, groupId } = await createSchedulableTournament(admin.cookie);

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings(), fingerprint: previewResponse.body.fingerprint });

    const persisted = await adminPrisma.footballMatch.findMany({ where: { tournamentId } });
    expect(persisted).toHaveLength(6);
    for (const match of persisted) {
      expect(match.type).toBe("TOURNAMENT");
      expect(match.homeAway).toBe("NEUTRAL");
      expect(match.status).toBe("SCHEDULED");
      expect(match.tournamentGroupId).toBe(groupId);
      expect(match.teamSeasonId).toBeNull();
      expect(match.opponentName).toBeNull();
      expect(match.venueId).toBe(venueId);
    }
  });

  it("two near-simultaneous commits for the same tournament: exactly one succeeds, the other is rejected, no duplicate matches", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-schedule-concurrent", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const { tournamentId } = await createSchedulableTournament(admin.cookie);

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/schedule/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());

    const commitBody = { ...defaultSettings(), fingerprint: previewResponse.body.fingerprint };
    const [responseA, responseB] = await Promise.all([
      request(server)
        .post(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`)
        .set("Cookie", admin.cookie)
        .set("X-Tenant-Id", tenantAId)
        .send(commitBody),
      request(server)
        .post(`/api/v1/football/tournaments/${tournamentId}/schedule/commit`)
        .set("Cookie", admin.cookie)
        .set("X-Tenant-Id", tenantAId)
        .send(commitBody),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const matchCount = await adminPrisma.footballMatch.count({ where: { tournamentId } });
    expect(matchCount).toBe(6);
  });
});
