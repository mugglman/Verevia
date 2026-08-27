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
 * End-to-end verification of the Phase 10 venue/match foundation — Venue
 * and FootballMatch endpoints — against a real PostgreSQL instance and
 * real better-auth sessions. Not part of `pnpm test`/CI (no DB there),
 * same reasoning as football-season.integration-spec.ts. Run via
 * `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let tenantBId: string;
let departmentFootballId: string;
let departmentTennisId: string;
let teamE1Id: string;
let teamE2Id: string;
let seasonFootballId: string;
let ageGroupId: string;
let teamSeasonE1Id: string;
let teamSeasonE2Id: string;
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
    data: { name: "Match Foundation API Test Tenant A", slug: `match-foundation-api-a-${Date.now()}` },
  });
  tenantAId = tenantA.id;

  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Match Foundation API Test Tenant B", slug: `match-foundation-api-b-${Date.now()}` },
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
  const e2 = await dbA.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E2" },
  });
  teamE1Id = e1.id;
  teamE2Id = e2.id;

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
  const teamSeasonE2 = await dbA.teamSeason.create({
    data: { tenantId: tenantAId, teamId: teamE2Id, seasonId: seasonFootballId, ageGroupId },
  });
  teamSeasonE1Id = teamSeasonE1.id;
  teamSeasonE2Id = teamSeasonE2.id;

  const venue = await dbA.venue.create({ data: { tenantId: tenantAId, name: "Sportplatz Test" } });
  venueId = venue.id;
});

afterAll(async () => {
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
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

describe("Venues API — auth baseline", () => {
  it("GET /api/v1/venues without a session → 401", async () => {
    const response = await request(server).get("/api/v1/venues").set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(401);
  });

  it("GET /api/v1/venues with a session but no membership → 403", async () => {
    const outsider = await createAuthenticatedMember(tenantBId, "outsider-venues", []);
    const response = await request(server)
      .get("/api/v1/venues")
      .set("Cookie", outsider.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });
});

describe("Venues API — authorization", () => {
  it("TENANT_ADMIN can create and update a venue", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-venue", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const createResponse = await request(server)
      .post("/api/v1/venues")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "TENANT_ADMIN Testplatz" });
    expect(createResponse.status).toBe(201);

    const updateResponse = await request(server)
      .patch(`/api/v1/venues/${createResponse.body.id}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ city: "Benediktbeuern" });
    expect(updateResponse.status).toBe(200);
    await adminPrisma.venue.delete({ where: { id: createResponse.body.id } });
  });

  it("COACH can read venues", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-venue-read", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .get("/api/v1/venues")
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.items.some((v: { id: string }) => v.id === venueId)).toBe(true);
    expect(response.body.canCreate).toBe(false);
  });

  it("COACH cannot update a venue", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-venue-update-forbidden", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .patch(`/api/v1/venues/${venueId}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ city: "Hijacked" });
    expect(response.status).toBe(403);
  });
});

describe("Matches API — authorization", () => {
  it("GET /api/v1/football/matches without a session → 401", async () => {
    const response = await request(server).get("/api/v1/football/matches").set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(401);
  });

  it("TENANT_ADMIN can create a match", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-match-create", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/football/matches")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        teamSeasonId: teamSeasonE1Id,
        opponentName: "TENANT_ADMIN Gegner",
        startsAt: "2026-09-12T08:00:00.000Z",
        type: "FRIENDLY",
        homeAway: "HOME",
      });
    expect(response.status).toBe(201);
    await adminPrisma.footballMatch.delete({ where: { id: response.body.id } });
  });

  it("DEPARTMENT_ADMIN Fußball can create and update a Fußball match", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-match-create", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const createResponse = await request(server)
      .post("/api/v1/football/matches")
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        teamSeasonId: teamSeasonE1Id,
        opponentName: "Dept Admin Gegner",
        startsAt: "2026-09-13T08:00:00.000Z",
        type: "LEAGUE",
        homeAway: "AWAY",
      });
    expect(createResponse.status).toBe(201);

    const updateResponse = await request(server)
      .patch(`/api/v1/football/matches/${createResponse.body.id}`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ notes: "Aktualisiert" });
    expect(updateResponse.status).toBe(200);
    await adminPrisma.footballMatch.delete({ where: { id: createResponse.body.id } });
  });

  it("DEPARTMENT_ADMIN Fußball is forbidden from creating a match for a Tennis team season", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-match-forbidden", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const tennisTeam = await dbA.team.create({
      data: { tenantId: tenantAId, departmentId: departmentTennisId, name: "Tennis 1" },
    });
    const tennisSeason = await dbA.season.create({
      data: {
        tenantId: tenantAId,
        departmentId: departmentTennisId,
        name: "2026",
        startsAt: new Date("2026-01-01"),
        endsAt: new Date("2026-12-31"),
      },
    });
    const tennisAgeGroup = await dbA.ageGroup.create({
      data: { tenantId: tenantAId, name: "Erwachsene", sortOrder: 1 },
    });
    const tennisTeamSeason = await dbA.teamSeason.create({
      data: { tenantId: tenantAId, teamId: tennisTeam.id, seasonId: tennisSeason.id, ageGroupId: tennisAgeGroup.id },
    });

    const response = await request(server)
      .post("/api/v1/football/matches")
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        teamSeasonId: tennisTeamSeason.id,
        opponentName: "Sollte scheitern",
        startsAt: "2026-09-14T08:00:00.000Z",
        type: "LEAGUE",
        homeAway: "HOME",
      });
    expect(response.status).toBe(403);

    await adminPrisma.teamSeason.delete({ where: { id: tennisTeamSeason.id } });
    await adminPrisma.ageGroup.delete({ where: { id: tennisAgeGroup.id } });
    await adminPrisma.season.delete({ where: { id: tennisSeason.id } });
    await adminPrisma.team.delete({ where: { id: tennisTeam.id } });
  });

  it("COACH E1 can create and update E1's own match", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-match-create", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const createResponse = await request(server)
      .post("/api/v1/football/matches")
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        teamSeasonId: teamSeasonE1Id,
        venueId,
        opponentName: "Coach Gegner",
        startsAt: "2026-09-15T08:00:00.000Z",
        type: "FRIENDLY",
        homeAway: "HOME",
      });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.canEdit).toBe(true);

    const updateResponse = await request(server)
      .patch(`/api/v1/football/matches/${createResponse.body.id}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ notes: "Trainingsspiel" });
    expect(updateResponse.status).toBe(200);
    await adminPrisma.footballMatch.delete({ where: { id: createResponse.body.id } });
  });

  it("COACH E1 is forbidden from updating E2's match", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const matchE2 = await dbA.footballMatch.create({
      data: {
        tenantId: tenantAId,
        teamSeasonId: teamSeasonE2Id,
        opponentName: "E2 Gegner",
        startsAt: new Date("2026-09-16T08:00:00.000Z"),
        type: "FRIENDLY",
        homeAway: "HOME",
      },
    });
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-match-forbidden", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .patch(`/api/v1/football/matches/${matchE2.id}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ notes: "Hijacked" });
    expect(response.status).toBe(403);
    await adminPrisma.footballMatch.delete({ where: { id: matchE2.id } });
  });

  it("ASSISTANT_COACH E1 can read but not create E1's match", async () => {
    const assistant = await createAuthenticatedMember(tenantAId, "assistant-coach-e1", [
      { role: "ASSISTANT_COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const listResponse = await request(server)
      .get(`/api/v1/football/matches?teamSeasonId=${teamSeasonE1Id}`)
      .set("Cookie", assistant.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(listResponse.status).toBe(200);

    const createResponse = await request(server)
      .post("/api/v1/football/matches")
      .set("Cookie", assistant.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        teamSeasonId: teamSeasonE1Id,
        opponentName: "Sollte scheitern",
        startsAt: "2026-09-17T08:00:00.000Z",
        type: "FRIENDLY",
        homeAway: "HOME",
      });
    expect(createResponse.status).toBe(403);
  });

  it("rejects a result on a SCHEDULED match (400)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-match-invalid-score", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/football/matches")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        teamSeasonId: teamSeasonE1Id,
        opponentName: "Invalid Score Gegner",
        startsAt: "2026-09-18T08:00:00.000Z",
        type: "LEAGUE",
        homeAway: "HOME",
        status: "SCHEDULED",
        homeScore: 2,
        awayScore: 0,
      });
    expect(response.status).toBe(400);
  });

  it("accepts a result on a COMPLETED match", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-match-valid-score", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/football/matches")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        teamSeasonId: teamSeasonE1Id,
        opponentName: "Valid Score Gegner",
        startsAt: "2026-08-01T08:00:00.000Z",
        type: "LEAGUE",
        homeAway: "HOME",
        status: "COMPLETED",
        homeScore: 2,
        awayScore: 0,
      });
    expect(response.status).toBe(201);
    expect(response.body.homeScore).toBe(2);
    await adminPrisma.footballMatch.delete({ where: { id: response.body.id } });
  });
});
