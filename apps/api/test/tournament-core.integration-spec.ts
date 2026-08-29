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
 * End-to-end verification of the Phase 11 tournament core — Tournaments/
 * Participants/TournamentVenues/TournamentGroups/tournament-mode Matches —
 * against a real PostgreSQL instance and real better-auth sessions. Not
 * part of `pnpm test`/CI (no DB there), same reasoning as
 * match-foundation.integration-spec.ts. Run via `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let tenantBId: string;
let departmentFootballId: string;
let departmentTennisId: string;
let teamE1Id: string;
let seasonFootballId: string;
let ageGroupId: string;
let teamSeasonE1Id: string;
let venueId: string;

interface AuthedMember {
  cookie: string;
  personId: string;
  userId: string;
}

const cleanupUserIds: string[] = [];

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

async function createTournament(
  cookie: string,
  overrides: Partial<{ departmentId: string; name: string; startsAt: string; mode: string }> = {},
) {
  return request(server)
    .post("/api/v1/football/tournaments")
    .set("Cookie", cookie)
    .set("X-Tenant-Id", tenantAId)
    .send({
      departmentId: departmentFootballId,
      name: `Test-Cup ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      startsAt: "2026-10-03T07:00:00.000Z",
      mode: "GROUPS",
      ...overrides,
    });
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
    data: { name: "Tournament Core API Test Tenant A", slug: `tournament-core-api-a-${Date.now()}` },
  });
  tenantAId = tenantA.id;

  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Tournament Core API Test Tenant B", slug: `tournament-core-api-b-${Date.now()}` },
  });
  tenantBId = tenantB.id;

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
});

afterAll(async () => {
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentParticipant.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentVenue.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballTournament.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.venue.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.teamSeason.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.ageGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.season.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("Tournaments API — auth baseline", () => {
  it("GET /api/v1/football/tournaments without a session → 401", async () => {
    const response = await request(server).get("/api/v1/football/tournaments").set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(401);
  });
});

describe("Tournaments API — authorization", () => {
  it("TENANT_ADMIN can create and update a tournament", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-tournament", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const createResponse = await createTournament(admin.cookie);
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.status).toBe("DRAFT");

    const updateResponse = await request(server)
      .patch(`/api/v1/football/tournaments/${createResponse.body.id}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ status: "PLANNED" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.status).toBe("PLANNED");
  });

  it("DEPARTMENT_ADMIN Fußball can create a tournament in their own department", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-tournament", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const response = await createTournament(deptAdmin.cookie);
    expect(response.status).toBe(201);
  });

  it("DEPARTMENT_ADMIN Fußball is forbidden from creating a tournament in the Tennis department", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-tournament-forbidden", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const response = await createTournament(deptAdmin.cookie, { departmentId: departmentTennisId });
    expect(response.status).toBe(403);
  });

  it("TENANT_ADMIN is rejected (400) when creating a tournament for a non-football department", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-tournament-tennis", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await createTournament(admin.cookie, { departmentId: departmentTennisId });
    expect(response.status).toBe(400);
  });

  it("COACH E1 can read tournaments but is forbidden from creating one", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-tournament-seed", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const seeded = await createTournament(admin.cookie);

    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-tournament-read", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const listResponse = await request(server)
      .get("/api/v1/football/tournaments")
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((t: { id: string }) => t.id === seeded.body.id)).toBe(true);
    expect(listResponse.body.find((t: { id: string }) => t.id === seeded.body.id).canEdit).toBe(false);

    const createResponse = await createTournament(coach.cookie);
    expect(createResponse.status).toBe(403);

  });
});

describe("Participants API", () => {
  it("TENANT_ADMIN adds an internal (TeamSeason) participant", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-participant-internal", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamSeasonId: teamSeasonE1Id });
    expect(response.status).toBe(201);
    expect(response.body.teamSeasonId).toBe(teamSeasonE1Id);
    expect(response.body.teamName).toBe("E1");
  });

  it("TENANT_ADMIN adds an external participant", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-participant-external", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "SV Testhausen" });
    expect(response.status).toBe(201);
    expect(response.body.externalName).toBe("SV Testhausen");
  });

  it("rejects a participant with BOTH teamSeasonId and externalName (400)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-participant-xor-both", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamSeasonId: teamSeasonE1Id, externalName: "Beides" });
    expect(response.status).toBe(400);
  });

  it("rejects a participant with NEITHER teamSeasonId nor externalName (400)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-participant-xor-neither", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({});
    expect(response.status).toBe(400);
  });

  it("rejects a teamSeasonId belonging to a DIFFERENT tenant (404 — RLS makes it invisible)", async () => {
    const dbB = getTenantPrisma(tenantBId);
    const footballB = await dbB.department.create({
      data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" },
    });
    const teamB = await dbB.team.create({ data: { tenantId: tenantBId, departmentId: footballB.id, name: "E1" } });
    const seasonB = await dbB.season.create({
      data: {
        tenantId: tenantBId,
        departmentId: footballB.id,
        name: "2026/2027",
        startsAt: new Date("2026-08-01"),
        endsAt: new Date("2027-06-30"),
      },
    });
    const ageGroupB = await dbB.ageGroup.create({ data: { tenantId: tenantBId, name: "E-Jugend", sortOrder: 1 } });
    const teamSeasonB = await dbB.teamSeason.create({
      data: { tenantId: tenantBId, teamId: teamB.id, seasonId: seasonB.id, ageGroupId: ageGroupB.id },
    });

    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-participant-cross-tenant", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamSeasonId: teamSeasonB.id });
    expect(response.status).toBe(404);

    await adminPrisma.teamSeason.delete({ where: { id: teamSeasonB.id } });
    await adminPrisma.ageGroup.delete({ where: { id: ageGroupB.id } });
    await adminPrisma.season.delete({ where: { id: seasonB.id } });
    await adminPrisma.team.delete({ where: { id: teamB.id } });
    await adminPrisma.department.delete({ where: { id: footballB.id } });
  });

  it("COACH is forbidden from adding a participant", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-participant-coach-setup", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const coach = await createAuthenticatedMember(tenantAId, "coach-participant-forbidden", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "Sollte scheitern" });
    expect(response.status).toBe(403);
  });
});

describe("Tournament venues API", () => {
  it("TENANT_ADMIN assigns an existing venue to a tournament", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-venue-assign", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/venues`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ venueId, label: "Hauptplatz" });
    expect(response.status).toBe(201);
    expect(response.body.venueName).toBe("Sportplatz Test");
  });

  it("rejects assigning the same venue twice (409 Conflict)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-venue-duplicate", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/venues`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ venueId });
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/venues`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ venueId });
    expect(response.status).toBe(409);
  });

  it("rejects removing a venue that is still used by a tournament match (409 Conflict)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-venue-remove-conflict", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/venues`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ venueId });
    const homeParticipant = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamSeasonId: teamSeasonE1Id });
    const awayParticipant = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "Konflikt-Gegner" });
    const match = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/matches`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        venueId,
        homeParticipantId: homeParticipant.body.id,
        awayParticipantId: awayParticipant.body.id,
        startsAt: "2026-10-03T08:00:00.000Z",
        type: "TOURNAMENT",
        homeAway: "HOME",
      });
    expect(match.status).toBe(201);

    const removeResponse = await request(server)
      .delete(`/api/v1/football/tournaments/${tournament.body.id}/venues/${venueId}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(removeResponse.status).toBe(409);

    await adminPrisma.footballMatch.delete({ where: { id: match.body.id } });
  });
});

describe("Tournament groups API", () => {
  it("TENANT_ADMIN creates a group and assigns a participant to it", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-assign", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const groupResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/groups`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Gruppe A" });
    expect(groupResponse.status).toBe(201);

    const participantResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "SV Gruppentest" });

    const assignResponse = await request(server)
      .patch(`/api/v1/football/tournaments/${tournament.body.id}/participants/${participantResponse.body.id}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ groupId: groupResponse.body.id });
    expect(assignResponse.status).toBe(200);
    expect(assignResponse.body.groupId).toBe(groupResponse.body.id);
    expect(assignResponse.body.groupName).toBe("Gruppe A");

  });

  it("rejects a duplicate group name within the same tournament (409 Conflict)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-duplicate", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/groups`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Gruppe A" });
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/groups`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Gruppe A" });
    expect(response.status).toBe(409);
  });

  it("rejects assigning a participant to a group from a DIFFERENT tournament (404 — wrong tournament context)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-group-wrong-tournament", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournamentOne = await createTournament(admin.cookie);
    const tournamentTwo = await createTournament(admin.cookie);
    const groupInTwo = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentTwo.body.id}/groups`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Fremdgruppe" });
    const participantInOne = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentOne.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "SV Fehlkontext" });

    const response = await request(server)
      .patch(`/api/v1/football/tournaments/${tournamentOne.body.id}/participants/${participantInOne.body.id}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ groupId: groupInTwo.body.id });
    expect(response.status).toBe(404);

  });
});

describe("Tournament matches API (convenience routes, shared MatchesService)", () => {
  it("TENANT_ADMIN manually creates a tournament match with two participants", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-tournament-match", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const home = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamSeasonId: teamSeasonE1Id });
    const away = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "SV Turniergegner" });

    const createResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/matches`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        homeParticipantId: home.body.id,
        awayParticipantId: away.body.id,
        startsAt: "2026-10-03T08:00:00.000Z",
        type: "FRIENDLY", // deliberately wrong — service must force TOURNAMENT
        homeAway: "HOME",
      });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.type).toBe("TOURNAMENT");
    expect(createResponse.body.tournamentId).toBe(tournament.body.id);
    expect(createResponse.body.homeParticipantName).toBe("E1");
    expect(createResponse.body.awayParticipantName).toBe("SV Turniergegner");
    expect(createResponse.body.teamSeasonId).toBeNull();

    const listResponse = await request(server)
      .get(`/api/v1/football/tournaments/${tournament.body.id}/matches`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((m: { id: string }) => m.id === createResponse.body.id)).toBe(true);

    await adminPrisma.footballMatch.delete({ where: { id: createResponse.body.id } });
  });

  it("rejects a homeParticipantId belonging to a DIFFERENT tournament (404 — wrong tournament context)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-tournament-match-wrong-context", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournamentOne = await createTournament(admin.cookie);
    const tournamentTwo = await createTournament(admin.cookie);
    const participantInTwo = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentTwo.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "Fremdturnier-Teilnehmer" });
    const participantInOne = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentOne.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "SV Eigenturnier" });

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentOne.body.id}/matches`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        homeParticipantId: participantInTwo.body.id,
        awayParticipantId: participantInOne.body.id,
        startsAt: "2026-10-03T08:00:00.000Z",
        type: "TOURNAMENT",
        homeAway: "HOME",
      });
    expect(response.status).toBe(404);

  });

  it("rejects a venue not assigned to the tournament (400)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-tournament-match-venue", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const home = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamSeasonId: teamSeasonE1Id });
    const away = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "SV Ohne Platz" });

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/matches`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        venueId, // never assigned to this tournament via TournamentVenue
        homeParticipantId: home.body.id,
        awayParticipantId: away.body.id,
        startsAt: "2026-10-03T08:00:00.000Z",
        type: "TOURNAMENT",
        homeAway: "HOME",
      });
    expect(response.status).toBe(400);

  });

  it("COACH is forbidden from creating a tournament match (authorized via canOnSeason, not canOnMatch)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-tournament-match-coach-setup", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const tournament = await createTournament(admin.cookie);
    const home = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamSeasonId: teamSeasonE1Id });
    const away = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/participants`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: "SV Coach-Verbot" });

    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-tournament-match-forbidden", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournament.body.id}/matches`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        homeParticipantId: home.body.id,
        awayParticipantId: away.body.id,
        startsAt: "2026-10-03T08:00:00.000Z",
        type: "TOURNAMENT",
        homeAway: "HOME",
      });
    expect(response.status).toBe(403);

  });
});
