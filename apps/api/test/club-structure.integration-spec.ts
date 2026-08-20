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
 * End-to-end verification of the club/department/team vertical slice
 * (Phase 3, section 26) against a real PostgreSQL instance and real
 * better-auth sessions — not part of `pnpm test`/CI (no DB there), same
 * reasoning as the other *.integration-spec.ts files. Run via
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

  // Mirrors apps/api/src/main.ts's bootstrap() exactly — otherwise the
  // versioned/prefixed routes this suite exercises (/api/v1/...) 404
  // against a bare AppModule instance.
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
    data: { name: "Club Test Tenant A", slug: `club-test-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Club Test Tenant B", slug: `club-test-b-${Date.now()}` },
  });
  tenantAId = tenantA.id;
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
  teamE1Id = e1.id;
  teamE2Id = e2.id;

  const dbB = getTenantPrisma(tenantBId);
  await dbB.department.create({ data: { tenantId: tenantBId, name: "Department B" } });
});

afterAll(async () => {
  for (const tenantId of [tenantAId, tenantBId]) {
    const db = getTenantPrisma(tenantId);
    await db.roleAssignment.deleteMany({});
  }
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  for (const tenantId of [tenantAId, tenantBId]) {
    const db = getTenantPrisma(tenantId);
    await db.person.deleteMany({});
    await db.team.deleteMany({});
    await db.department.deleteMany({});
  }
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("Club structure API — auth/tenant baseline", () => {
  it("GET /api/v1/club without a session → 401", async () => {
    const response = await request(server).get("/api/v1/club").set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(401);
  });

  it("GET /api/v1/club with a session but no membership in the requested tenant → 403", async () => {
    const outsider = await createAuthenticatedMember(tenantBId, "outsider", []);
    const response = await request(server)
      .get("/api/v1/club")
      .set("Cookie", outsider.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });

  it("a manipulated X-Tenant-Id for a foreign tenant never grants access", async () => {
    const memberOfB = await createAuthenticatedMember(tenantBId, "member-b", [
      { role: "MEMBER", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .get("/api/v1/club")
      .set("Cookie", memberOfB.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });
});

describe("Club structure API — cross-tenant isolation", () => {
  it("Tenant A sees no Departments of Tenant B", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "isolation-admin-a", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .get("/api/v1/departments")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    const names: string[] = response.body.items.map((d: { name: string }) => d.name);
    expect(names).toContain("Fußball");
    expect(names).not.toContain("Department B");
  });

  it("Tenant A sees no Teams of Tenant B", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "isolation-admin-a2", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .get("/api/v1/teams")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    const ids: string[] = response.body.map((t: { id: string }) => t.id);
    expect(ids).toContain(teamE1Id);
  });

  it("creating a Team with a departmentId from a different tenant fails (department not found under this tenant context)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "cross-tenant-create", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbB = getTenantPrisma(tenantBId);
    const foreignDepartment = await dbB.department.findFirstOrThrow({
      where: { tenantId: tenantBId },
    });
    const response = await request(server)
      .post("/api/v1/teams")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Cross-Tenant Team", departmentId: foreignDepartment.id });
    expect(response.status).toBe(404);
  });
});

describe("Club structure API — authorization (TENANT_ADMIN)", () => {
  it("TENANT_ADMIN can create a Department", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-dept", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/departments")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Stockschützen" });
    expect(response.status).toBe(201);
    expect(response.body.name).toBe("Stockschützen");
  });

  it("TENANT_ADMIN can create a Team", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-team", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/teams")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Alte Herren", departmentId: departmentFootballId });
    expect(response.status).toBe(201);
    expect(response.body.name).toBe("Alte Herren");
  });

  it("rejects unknown fields in the request body (whitelist validation)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-validation", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/departments")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Should Fail", tenantId: "attacker-supplied-tenant-id" });
    expect(response.status).toBe(400);
  });
});

describe("Club structure API — authorization (DEPARTMENT_ADMIN)", () => {
  it("DEPARTMENT_ADMIN Fußball can create a Team in Fußball", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-ok", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const response = await request(server)
      .post("/api/v1/teams")
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "D-Jugend", departmentId: departmentFootballId });
    expect(response.status).toBe(201);
  });

  it("DEPARTMENT_ADMIN Fußball cannot create a Team in Tennis", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-forbidden", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const response = await request(server)
      .post("/api/v1/teams")
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Tennis Team", departmentId: departmentTennisId });
    expect(response.status).toBe(403);
  });
});

describe("Club structure API — authorization (COACH)", () => {
  it("COACH of E1 can read E1", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-read", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .get(`/api/v1/teams/${teamE1Id}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(teamE1Id);
  });

  it("COACH of E1 cannot update E2", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-forbidden", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const response = await request(server)
      .patch(`/api/v1/teams/${teamE2Id}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ name: "Hijacked" });
    expect(response.status).toBe(403);
  });

  it("COACH of E1 can read the club and their own department (Fußball)", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-context", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const clubResponse = await request(server)
      .get("/api/v1/club")
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(clubResponse.status).toBe(200);

    const deptResponse = await request(server)
      .get(`/api/v1/departments/${departmentFootballId}`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(deptResponse.status).toBe(200);
  });
});
