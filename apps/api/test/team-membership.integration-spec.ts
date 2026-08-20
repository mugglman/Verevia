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
 * End-to-end verification of the Personen-/Teammitglieder vertical slice
 * (Phase 4, section 22) against a real PostgreSQL instance and real
 * better-auth sessions — not part of `pnpm test`/CI (no DB there), same
 * reasoning as club-structure.integration-spec.ts. Run via
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
let teamTennisId: string;

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
    data: { name: "Membership Test Tenant A", slug: `membership-test-a-${Date.now()}` },
  });
  tenantAId = tenantA.id;

  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Membership Test Tenant B", slug: `membership-test-b-${Date.now()}` },
  });
  tenantBId = tenantB.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({ data: { tenantId: tenantAId, name: "Fußball" } });
  const tennis = await dbA.department.create({ data: { tenantId: tenantAId, name: "Tennis" } });
  departmentFootballId = football.id;
  departmentTennisId = tennis.id;

  const e1 = await dbA.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E1" },
  });
  const e2 = await dbA.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E2" },
  });
  const tennisTeam = await dbA.team.create({
    data: { tenantId: tenantAId, departmentId: departmentTennisId, name: "Tennis 1" },
  });
  teamE1Id = e1.id;
  teamE2Id = e2.id;
  teamTennisId = tennisTeam.id;
});

afterAll(async () => {
  await adminPrisma.teamMember.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.roleAssignment.deleteMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
  });
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
  });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("Persons/TeamMembers API — auth baseline", () => {
  it("GET /api/v1/persons without a session → 401", async () => {
    const response = await request(server).get("/api/v1/persons").set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(401);
  });

  it("GET /api/v1/persons with a session but no membership → 403", async () => {
    const outsider = await createAuthenticatedMember(tenantBId, "outsider", []);
    const response = await request(server)
      .get("/api/v1/persons")
      .set("Cookie", outsider.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });
});

describe("Persons API — authorization (TENANT_ADMIN)", () => {
  it("TENANT_ADMIN can create a person", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-persons", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/persons")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ firstName: "Neu", lastName: "Person" });
    expect(response.status).toBe(201);
    expect(response.body.firstName).toBe("Neu");
  });

  it("TENANT_ADMIN can add a team member", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-members", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const person = await dbA.person.create({
      data: { tenantId: tenantAId, firstName: "Spieler", lastName: "Eins" },
    });
    const response = await request(server)
      .post(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ personId: person.id });
    expect(response.status).toBe(201);
    expect(response.body.personId).toBe(person.id);
  });
});

describe("Persons/TeamMembers API — authorization (DEPARTMENT_ADMIN)", () => {
  it("DEPARTMENT_ADMIN Fußball can add a member to E1", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-add-e1", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const person = await dbA.person.create({
      data: { tenantId: tenantAId, firstName: "Spieler", lastName: "Zwei" },
    });
    const response = await request(server)
      .post(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ personId: person.id });
    expect(response.status).toBe(201);
  });

  it("DEPARTMENT_ADMIN Fußball cannot add a member to a Tennis team", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-add-tennis", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const person = await dbA.person.create({
      data: { tenantId: tenantAId, firstName: "Spieler", lastName: "Drei" },
    });
    const response = await request(server)
      .post(`/api/v1/teams/${teamTennisId}/members`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ personId: person.id });
    expect(response.status).toBe(403);
  });
});

describe("Persons/TeamMembers API — authorization (COACH)", () => {
  it("COACH E1 can read E1 members", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-read", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .get(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.canManage).toBe(false);
  });

  it("COACH E1 cannot read E2 members", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-read-e2", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .get(`/api/v1/teams/${teamE2Id}/members`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });

  it("COACH cannot list the global persons list", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-global-persons", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .get("/api/v1/persons")
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });
});

describe("TeamMembers API — no duplicate active assignment", () => {
  it("rejects adding the same person to the same team twice", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-duplicate", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const person = await dbA.person.create({
      data: { tenantId: tenantAId, firstName: "Doppelt", lastName: "Test" },
    });
    const first = await request(server)
      .post(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ personId: person.id });
    expect(first.status).toBe(201);

    const second = await request(server)
      .post(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ personId: person.id });
    expect(second.status).toBe(409);
  });
});

describe("TeamMembers API — remove is a soft removal", () => {
  it("DELETE removes the person from the members list but not the Person itself", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-remove", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const person = await dbA.person.create({
      data: { tenantId: tenantAId, firstName: "Entfernen", lastName: "Test" },
    });
    await request(server)
      .post(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ personId: person.id });

    const deleteResponse = await request(server)
      .delete(`/api/v1/teams/${teamE1Id}/members/${person.id}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(deleteResponse.status).toBe(204);

    const membersResponse = await request(server)
      .get(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(membersResponse.body.items.map((m: { personId: string }) => m.personId)).not.toContain(
      person.id,
    );

    const personResponse = await request(server)
      .get(`/api/v1/persons/${person.id}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(personResponse.status).toBe(200);
  });
});
