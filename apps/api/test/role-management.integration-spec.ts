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
 * End-to-end verification of the role-management vertical slice (Phase 5,
 * sections 26/27) against a real PostgreSQL instance and real better-auth
 * sessions — not part of `pnpm test`/CI (no DB there), same reasoning as
 * the other *.integration-spec.ts files. Run via `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let tenantBId: string;
let departmentFootballId: string;
let departmentBId: string;
let teamE1Id: string;
let teamE2Id: string;
let teamBId: string;

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
    data: { name: "Role Test Tenant A", slug: `role-test-a-${Date.now()}` },
  });
  tenantAId = tenantA.id;
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Role Test Tenant B", slug: `role-test-b-${Date.now()}` },
  });
  tenantBId = tenantB.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({ data: { tenantId: tenantAId, name: "Fußball" } });
  departmentFootballId = football.id;
  const e1 = await dbA.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E1" },
  });
  const e2 = await dbA.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E2" },
  });
  teamE1Id = e1.id;
  teamE2Id = e2.id;

  const dbB = getTenantPrisma(tenantBId);
  const departmentB = await dbB.department.create({ data: { tenantId: tenantBId, name: "Department B" } });
  departmentBId = departmentB.id;
  const teamB = await dbB.team.create({
    data: { tenantId: tenantBId, departmentId: departmentBId, name: "Team B" },
  });
  teamBId = teamB.id;
});

afterAll(async () => {
  await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.teamMember.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
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

describe("Roles API — auth baseline", () => {
  it("GET .../roles without a session → 401", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const person = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "X", lastName: "Y" } });
    const response = await request(server)
      .get(`/api/v1/persons/${person.id}/roles`)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(401);
  });

  it("GET .../roles with a session but no membership → 403", async () => {
    const outsider = await createAuthenticatedMember(tenantBId, "outsider", []);
    const dbA = getTenantPrisma(tenantAId);
    const person = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "X2", lastName: "Y2" } });
    const response = await request(server)
      .get(`/api/v1/persons/${person.id}/roles`)
      .set("Cookie", outsider.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });

  it("a manipulated X-Tenant-Id for a foreign tenant never grants access", async () => {
    const memberOfB = await createAuthenticatedMember(tenantBId, "member-of-b", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const person = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "X3", lastName: "Y3" } });
    const response = await request(server)
      .get(`/api/v1/persons/${person.id}/roles`)
      .set("Cookie", memberOfB.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });
});

describe("Roles API — authorization", () => {
  it("TENANT_ADMIN can read a person's roles", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-read", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .get(`/api/v1/persons/${admin.personId}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("TENANT_ADMIN can grant a role", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-grant", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const target = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Grant", lastName: "Target" } });
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "COACH", scopeType: "TEAM", teamId: teamE1Id });
    expect(response.status).toBe(201);
    expect(response.body.role).toBe("COACH");
    expect(response.body.teamId).toBe(teamE1Id);
  });

  it("TENANT_ADMIN can revoke a role", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-revoke", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const target = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Revoke", lastName: "Target" } });
    const granted = await dbA.roleAssignment.create({
      data: { tenantId: tenantAId, personId: target.id, role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    });
    const response = await request(server)
      .delete(`/api/v1/persons/${target.id}/roles/${granted.id}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(204);

    const remaining = await dbA.roleAssignment.findUnique({ where: { id: granted.id } });
    expect(remaining).toBeNull();
    // revoke must not delete the Person itself
    const stillThere = await dbA.person.findUnique({ where: { id: target.id } });
    expect(stillThere).not.toBeNull();
  });

  it("DEPARTMENT_ADMIN cannot grant a role", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-grant", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const target = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Dept", lastName: "Target" } });
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/roles`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "COACH", scopeType: "TEAM", teamId: teamE1Id });
    expect(response.status).toBe(403);
  });

  it("COACH cannot grant a role", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-grant", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const target = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Coach", lastName: "Target" } });
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/roles`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "COACH", scopeType: "TEAM", teamId: teamE1Id });
    expect(response.status).toBe(403);
  });
});

describe("Roles API — privilege escalation / validation", () => {
  it("rejects an invalid role/scope combination", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-invalid-scope", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const target = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Bad", lastName: "Scope" } });
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "TENANT_ADMIN", scopeType: "TEAM", teamId: teamE1Id });
    expect(response.status).toBe(400);
  });

  it("rejects an unknown role value", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-unknown-role", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const target = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Unknown", lastName: "Role" } });
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "SUPER_ADMIN", scopeType: "TENANT" });
    expect(response.status).toBe(400);
  });

  it("a Team from tenant B is treated as not found (cross-tenant escalation blocked)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-cross-team", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const target = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Cross", lastName: "Team" } });
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "COACH", scopeType: "TEAM", teamId: teamBId });
    expect(response.status).toBe(404);
  });

  it("a Department from tenant B is treated as not found (cross-tenant escalation blocked)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-cross-dept", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const target = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Cross", lastName: "Dept" } });
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentBId });
    expect(response.status).toBe(404);
  });

  it("rejects an exact duplicate role assignment", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-duplicate-role", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const target = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Dup", lastName: "Role" } });
    const first = await request(server)
      .post(`/api/v1/persons/${target.id}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "COACH", scopeType: "TEAM", teamId: teamE1Id });
    expect(first.status).toBe(201);

    const second = await request(server)
      .post(`/api/v1/persons/${target.id}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "COACH", scopeType: "TEAM", teamId: teamE1Id });
    expect(second.status).toBe(409);
  });
});

describe("Roles API — last TENANT_ADMIN protection", () => {
  it("cannot remove the only active TENANT_ADMIN of the tenant", async () => {
    // Deliberately isolated tenant: tenantAId is shared across this whole
    // file and by this point already has several unrelated TENANT_ADMIN
    // fixtures from earlier tests (e.g. "tenant-admin-grant",
    // "tenant-admin-cross-team", ...) — testing "the ONLY admin" against
    // it would silently pass for the wrong reason (an admin from a
    // different test happens to satisfy "at least one other admin
    // remains"). A fresh tenant guarantees exactly one TENANT_ADMIN exists.
    const isolatedTenant = await adminPrisma.tenant.create({
      data: { name: "Sole Admin Test Tenant", slug: `sole-admin-test-${Date.now()}` },
    });
    const soleAdmin = await createAuthenticatedMember(isolatedTenant.id, "sole-admin", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbIsolated = getTenantPrisma(isolatedTenant.id);
    const assignment = await dbIsolated.roleAssignment.findFirstOrThrow({
      where: { tenantId: isolatedTenant.id, personId: soleAdmin.personId, role: "TENANT_ADMIN" },
    });
    const response = await request(server)
      .delete(`/api/v1/persons/${soleAdmin.personId}/roles/${assignment.id}`)
      .set("Cookie", soleAdmin.cookie)
      .set("X-Tenant-Id", isolatedTenant.id);
    expect(response.status).toBe(409);

    const stillThere = await dbIsolated.roleAssignment.findUnique({ where: { id: assignment.id } });
    expect(stillThere).not.toBeNull();

    await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: isolatedTenant.id } });
    await adminPrisma.membership.deleteMany({ where: { personId: soleAdmin.personId } });
    await adminPrisma.person.deleteMany({ where: { tenantId: isolatedTenant.id } });
    await adminPrisma.tenant.delete({ where: { id: isolatedTenant.id } });
  });

  it("allows removing a TENANT_ADMIN when another usable one remains", async () => {
    const firstAdmin = await createAuthenticatedMember(tenantAId, "first-admin", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const secondAdmin = await createAuthenticatedMember(tenantAId, "second-admin", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const dbA = getTenantPrisma(tenantAId);
    const firstAssignment = await dbA.roleAssignment.findFirstOrThrow({
      where: { tenantId: tenantAId, personId: firstAdmin.personId, role: "TENANT_ADMIN" },
    });
    const response = await request(server)
      .delete(`/api/v1/persons/${firstAdmin.personId}/roles/${firstAssignment.id}`)
      .set("Cookie", secondAdmin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(204);
  });
});

describe("RBAC lifecycle (Phase 5, section 27)", () => {
  it("granting and revoking COACH/E1 immediately changes access, without any restart", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "lifecycle-admin", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const target = await createAuthenticatedMember(tenantAId, "lifecycle-target", []);

    // 1. No COACH role yet → E1 members not accessible.
    const before = await request(server)
      .get(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", target.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(before.status).toBe(403);

    // 2. TENANT_ADMIN grants COACH/E1.
    const grant = await request(server)
      .post(`/api/v1/persons/${target.personId}/roles`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ role: "COACH", scopeType: "TEAM", teamId: teamE1Id });
    expect(grant.status).toBe(201);
    const roleAssignmentId = grant.body.id as string;

    // 3. E1 now accessible, E2 still not.
    const afterGrantE1 = await request(server)
      .get(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", target.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(afterGrantE1.status).toBe(200);

    const afterGrantE2 = await request(server)
      .get(`/api/v1/teams/${teamE2Id}/members`)
      .set("Cookie", target.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(afterGrantE2.status).toBe(403);

    // 4. TENANT_ADMIN revokes COACH/E1.
    const revoke = await request(server)
      .delete(`/api/v1/persons/${target.personId}/roles/${roleAssignmentId}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(revoke.status).toBe(204);

    // 5. E1 access immediately revoked again.
    const afterRevoke = await request(server)
      .get(`/api/v1/teams/${teamE1Id}/members`)
      .set("Cookie", target.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(afterRevoke.status).toBe(403);
  });
});
