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
 * End-to-end verification of the football season foundation (Phase 9) —
 * Season/AgeGroup/TeamSeason endpoints — against a real PostgreSQL instance
 * and real better-auth sessions. Not part of `pnpm test`/CI (no DB there),
 * same reasoning as team-membership.integration-spec.ts. Run via
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
let seasonTennisId: string;
let ageGroupId: string;

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
    data: { name: "Football Season API Test Tenant A", slug: `football-api-a-${Date.now()}` },
  });
  tenantAId = tenantA.id;

  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Football Season API Test Tenant B", slug: `football-api-b-${Date.now()}` },
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

  const seasonTennis = await dbA.season.create({
    data: {
      tenantId: tenantAId,
      departmentId: departmentTennisId,
      name: "2026",
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-12-31"),
      status: "ACTIVE",
    },
  });
  seasonTennisId = seasonTennis.id;

  const ageGroup = await dbA.ageGroup.create({
    data: { tenantId: tenantAId, name: "E-Jugend", sortOrder: 1 },
  });
  ageGroupId = ageGroup.id;
});

afterAll(async () => {
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

describe("Seasons API — auth baseline", () => {
  it("GET /api/v1/seasons without a session → 401", async () => {
    const response = await request(server).get("/api/v1/seasons").set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(401);
  });

  it("GET /api/v1/seasons with a session but no membership → 403", async () => {
    const outsider = await createAuthenticatedMember(tenantBId, "outsider-seasons", []);
    const response = await request(server)
      .get("/api/v1/seasons")
      .set("Cookie", outsider.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });
});

describe("Seasons API — authorization (TENANT_ADMIN)", () => {
  it("TENANT_ADMIN can create a season", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-season-create", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/seasons")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        departmentId: departmentTennisId,
        name: "2027",
        startsAt: "2027-01-01",
        endsAt: "2027-12-31",
      });
    expect(response.status).toBe(201);
    expect(response.body.name).toBe("2027");
    await adminPrisma.season.delete({ where: { id: response.body.id } });
  });

  it("TENANT_ADMIN can update a season", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-season-update", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .patch(`/api/v1/seasons/${seasonFootballId}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "2026/2027" });
    expect(response.status).toBe(200);
  });
});

describe("Seasons API — authorization (DEPARTMENT_ADMIN Football)", () => {
  it("DEPARTMENT_ADMIN Football can create a season in the football department", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-season-create", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const response = await request(server)
      .post("/api/v1/seasons")
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        departmentId: departmentFootballId,
        name: "2028/2029",
        startsAt: "2028-08-01",
        endsAt: "2029-06-30",
        status: "PLANNED",
      });
    expect(response.status).toBe(201);
    await adminPrisma.season.delete({ where: { id: response.body.id } });
  });

  it("DEPARTMENT_ADMIN Football can update the football season", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-season-update", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const response = await request(server)
      .patch(`/api/v1/seasons/${seasonFootballId}`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "2026/2027 (aktualisiert)" });
    expect(response.status).toBe(200);
    await adminPrisma.season.update({ where: { id: seasonFootballId }, data: { name: "2026/2027" } });
  });

  it("DEPARTMENT_ADMIN Football is forbidden from updating the Tennis season", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-season-forbidden", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const response = await request(server)
      .patch(`/api/v1/seasons/${seasonTennisId}`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Hijacked" });
    expect(response.status).toBe(403);
  });

  it("DEPARTMENT_ADMIN Football is forbidden from creating a season for the Tennis department", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-season-create-forbidden", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const response = await request(server)
      .post("/api/v1/seasons")
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        departmentId: departmentTennisId,
        name: "Should Fail",
        startsAt: "2030-01-01",
        endsAt: "2030-12-31",
      });
    expect(response.status).toBe(403);
  });
});

describe("Seasons API — authorization (COACH)", () => {
  it("COACH can read the active football season", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-season-read", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .get(`/api/v1/seasons/${seasonFootballId}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.canEdit).toBe(false);
  });

  it("COACH cannot update the season", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-season-update-forbidden", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .patch(`/api/v1/seasons/${seasonFootballId}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Hijacked by coach" });
    expect(response.status).toBe(403);
  });
});

describe("Seasons API — date validation", () => {
  it("rejects a season where startsAt is not before endsAt", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-season-invalid-range", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/seasons")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        departmentId: departmentTennisId,
        name: "Invalid Range",
        startsAt: "2031-12-31",
        endsAt: "2031-01-01",
      });
    expect(response.status).toBe(400);
  });

  it("rejects a second ACTIVE season for the same department", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-season-second-active", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/seasons")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({
        departmentId: departmentFootballId, // already has seasonFootballId as ACTIVE
        name: "Second Active",
        startsAt: "2032-08-01",
        endsAt: "2033-06-30",
        status: "ACTIVE",
      });
    expect(response.status).toBe(409);
  });
});

describe("AgeGroups API — authorization", () => {
  it("GET /api/v1/football/age-groups without a session → 401", async () => {
    const response = await request(server)
      .get("/api/v1/football/age-groups")
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(401);
  });

  it("any active role can read age groups", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-age-group-read", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .get("/api/v1/football/age-groups")
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.some((ag: { id: string }) => ag.id === ageGroupId)).toBe(true);
  });

  it("TENANT_ADMIN can create an age group", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-age-group-create", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/football/age-groups")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "D-Jugend", sortOrder: 2 });
    expect(response.status).toBe(201);
    await adminPrisma.ageGroup.delete({ where: { id: response.body.id } });
  });

  it("DEPARTMENT_ADMIN cannot create an age group (tenant-wide reference data)", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-age-group-forbidden", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const response = await request(server)
      .post("/api/v1/football/age-groups")
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "C-Jugend" });
    expect(response.status).toBe(403);
  });
});

describe("TeamSeasons API — authorization and football-only guardrail", () => {
  it("TENANT_ADMIN can create a team season for a football team", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-team-season-create", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/football/team-seasons")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamId: teamE1Id, seasonId: seasonFootballId, ageGroupId: ageGroupId });
    expect(response.status).toBe(201);
    expect(response.body.teamId).toBe(teamE1Id);
    await adminPrisma.teamSeason.delete({ where: { id: response.body.id } });
  });

  it("rejects a team season for a non-football (Tennis) team", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-team-season-non-football", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const tennisTeam = await dbA.team.create({
      data: { tenantId: tenantAId, departmentId: departmentTennisId, name: "Tennis 1" },
    });
    const response = await request(server)
      .post("/api/v1/football/team-seasons")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ teamId: tennisTeam.id, seasonId: seasonTennisId, ageGroupId: ageGroupId });
    expect(response.status).toBe(400);
    await adminPrisma.team.delete({ where: { id: tennisTeam.id } });
  });

  it("COACH E1 can read E1's own team season", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const teamSeason = await dbA.teamSeason.create({
      data: { tenantId: tenantAId, teamId: teamE1Id, seasonId: seasonFootballId, ageGroupId: ageGroupId },
    });
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-team-season-read", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .get(`/api/v1/football/team-seasons/${teamSeason.id}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.canEdit).toBe(false);
    await adminPrisma.teamSeason.delete({ where: { id: teamSeason.id } });
  });

  it("COACH E1 is forbidden from updating E2's team season", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const teamSeasonE2 = await dbA.teamSeason.create({
      data: { tenantId: tenantAId, teamId: teamE2Id, seasonId: seasonFootballId, ageGroupId: ageGroupId },
    });
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-team-season-forbidden", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .patch(`/api/v1/football/team-seasons/${teamSeasonE2.id}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ displayName: "Hijacked" });
    expect(response.status).toBe(403);
    await adminPrisma.teamSeason.delete({ where: { id: teamSeasonE2.id } });
  });
});
