import "reflect-metadata";
import crypto from "node:crypto";
import { INestApplication, RequestMethod, ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@verevia/auth";
import { createAdminPrismaForTests, getTenantPrisma } from "@verevia/database";
import { AppModule } from "../src/app.module";

/**
 * End-to-end verification of account invitations + guardian relationships
 * + ReBAC (Phase 6, sections 26/27/28) against a real PostgreSQL instance
 * and real better-auth sessions. Not part of `pnpm test`/CI (no DB
 * there), same reasoning as the other *.integration-spec.ts files. Run
 * via `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let tenantBId: string;
let departmentFootballId: string;
let teamE1Id: string;

interface AuthedMember {
  cookie: string;
  personId: string;
  userId: string;
  email: string;
}

const cleanupUserIds: string[] = [];

async function signUpMember(
  tenantId: string,
  label: string,
  roleAssignments: Array<{
    role: string;
    scopeType: "TENANT" | "DEPARTMENT" | "TEAM";
    departmentId?: string;
    teamId?: string;
  }> = [],
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

  return { cookie, personId: person.id, userId: dbUser.id, email };
}

/** A tenant-bound Person with no linked User/login yet. */
async function createBarePerson(tenantId: string, firstName: string, lastName = "Test") {
  const db = getTenantPrisma(tenantId);
  return db.person.create({ data: { tenantId, firstName, lastName } });
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
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();
  server = app.getHttpServer();

  const tenantA = await adminPrisma.tenant.create({
    data: { name: "Guardian Test Tenant A", slug: `guardian-test-a-${Date.now()}` },
  });
  tenantAId = tenantA.id;
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Guardian Test Tenant B", slug: `guardian-test-b-${Date.now()}` },
  });
  tenantBId = tenantB.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({ data: { tenantId: tenantAId, name: "Fußball" } });
  departmentFootballId = football.id;
  const e1 = await dbA.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E1" },
  });
  teamE1Id = e1.id;
});

afterAll(async () => {
  await adminPrisma.accountInvitation.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.personRelationship.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
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

describe("Invitations API — authorization (section 26)", () => {
  it("TENANT_ADMIN can invite a person", async () => {
    const admin = await signUpMember(tenantAId, "inv-admin-1", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const target = await createBarePerson(tenantAId, "InviteTarget1");
    const email = `invitee-${Date.now()}@example.invalid`;
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/invitations`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email });
    expect(response.status).toBe(201);
    expect(response.body.email).toBe(email);
    expect(typeof response.body.token).toBe("string"); // dev-only convenience field
  });

  it("DEPARTMENT_ADMIN cannot invite a person", async () => {
    const deptAdmin = await signUpMember(tenantAId, "inv-dept-admin", [
      { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId },
    ]);
    const target = await createBarePerson(tenantAId, "InviteTarget2");
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/invitations`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email: "x@example.invalid" });
    expect(response.status).toBe(403);
  });

  it("COACH cannot invite a person", async () => {
    const coach = await signUpMember(tenantAId, "inv-coach", [
      { role: "COACH", scopeType: "TEAM", teamId: teamE1Id },
    ]);
    const target = await createBarePerson(tenantAId, "InviteTarget3");
    const response = await request(server)
      .post(`/api/v1/persons/${target.id}/invitations`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email: "x@example.invalid" });
    expect(response.status).toBe(403);
  });

  it("a Person from a foreign tenant cannot be invited (404, not leaked)", async () => {
    const admin = await signUpMember(tenantAId, "inv-admin-2", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const foreignPerson = await createBarePerson(tenantBId, "ForeignTarget");
    const response = await request(server)
      .post(`/api/v1/persons/${foreignPerson.id}/invitations`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email: "x@example.invalid" });
    expect(response.status).toBe(404);
  });

  it("a Person already linked to an account gives a clear conflict", async () => {
    const admin = await signUpMember(tenantAId, "inv-admin-3", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const alreadyLinked = await signUpMember(tenantAId, "already-linked");
    const response = await request(server)
      .post(`/api/v1/persons/${alreadyLinked.personId}/invitations`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email: "x@example.invalid" });
    expect(response.status).toBe(409);
  });
});

describe("Invitations API — accept flow (section 26)", () => {
  it("a valid token can be accepted and creates exactly one new Membership", async () => {
    const admin = await signUpMember(tenantAId, "accept-admin-1", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const target = await createBarePerson(tenantAId, "AcceptTarget1");
    const email = `accept-${Date.now()}@example.invalid`;
    const createResponse = await request(server)
      .post(`/api/v1/persons/${target.id}/invitations`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email });
    const token = createResponse.body.token as string;

    const password = "Sup3rSicher!Invitee";
    const signupResponse = await request(server)
      .post("/api/auth/sign-up/email")
      .send({ email, password, name: "Invitee" });
    const setCookie = signupResponse.headers["set-cookie"];
    const inviteeCookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
    const inviteeUser = await adminPrisma.user.findUniqueOrThrow({ where: { email } });
    cleanupUserIds.push(inviteeUser.id);

    const acceptResponse = await request(server)
      .post("/api/v1/invitations/accept")
      .set("Cookie", inviteeCookie)
      .send({ token });
    expect(acceptResponse.status).toBe(201);

    const membership = await adminPrisma.membership.findUnique({ where: { personId: target.id } });
    expect(membership?.userId).toBe(inviteeUser.id);
    expect(membership?.status).toBe("ACTIVE");

    const invitation = await adminPrisma.accountInvitation.findUniqueOrThrow({
      where: { id: createResponse.body.id },
    });
    expect(invitation.status).toBe("ACCEPTED");
  });

  it("an unknown token is rejected without detail", async () => {
    const admin = await signUpMember(tenantAId, "accept-admin-2", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const response = await request(server)
      .post("/api/v1/invitations/accept")
      .set("Cookie", admin.cookie)
      .send({ token: "not-a-real-token" });
    expect(response.status).toBe(404);
  });

  it("an expired token is rejected", async () => {
    const admin = await signUpMember(tenantAId, "accept-admin-expired", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const target = await createBarePerson(tenantAId, "ExpiredTarget");
    const email = `expired-${Date.now()}@example.invalid`;
    // Bypasses the service to insert a row with a real, correctly-hashed
    // token but an already-past expiresAt — the service itself never
    // creates an already-expired invitation, so this is the only way to
    // exercise the expiry check specifically (as opposed to the "unknown
    // token" case, which a mismatched hash would test instead).
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expired = await adminPrisma.accountInvitation.create({
      data: {
        tenantId: tenantAId,
        personId: target.id,
        email,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000),
        invitedByUserId: admin.userId,
      },
    });

    const lookupResponse = await request(server).get(`/api/v1/invitations/${rawToken}`);
    expect(lookupResponse.status).toBe(404);

    await adminPrisma.accountInvitation.delete({ where: { id: expired.id } });
  });

  it("an already-accepted token cannot be used again", async () => {
    const admin = await signUpMember(tenantAId, "accept-admin-3", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const target = await createBarePerson(tenantAId, "ReuseTarget");
    const email = `reuse-${Date.now()}@example.invalid`;
    const createResponse = await request(server)
      .post(`/api/v1/persons/${target.id}/invitations`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email });
    const token = createResponse.body.token as string;

    const signupResponse = await request(server)
      .post("/api/auth/sign-up/email")
      .send({ email, password: "Sup3rSicher!Reuse", name: "Reuse" });
    const setCookie = signupResponse.headers["set-cookie"];
    const inviteeCookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
    const inviteeUser = await adminPrisma.user.findUniqueOrThrow({ where: { email } });
    cleanupUserIds.push(inviteeUser.id);

    const first = await request(server)
      .post("/api/v1/invitations/accept")
      .set("Cookie", inviteeCookie)
      .send({ token });
    expect(first.status).toBe(201);

    const second = await request(server)
      .post("/api/v1/invitations/accept")
      .set("Cookie", inviteeCookie)
      .send({ token });
    expect(second.status).toBe(404);
  });

  it("a revoked invitation cannot be accepted", async () => {
    const admin = await signUpMember(tenantAId, "accept-admin-4", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const target = await createBarePerson(tenantAId, "RevokeTarget");
    const email = `revoke-${Date.now()}@example.invalid`;
    const createResponse = await request(server)
      .post(`/api/v1/persons/${target.id}/invitations`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email });
    const token = createResponse.body.token as string;
    const invitationId = createResponse.body.id as string;

    const revokeResponse = await request(server)
      .delete(`/api/v1/persons/${target.id}/invitations/${invitationId}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(revokeResponse.status).toBe(204);

    const signupResponse = await request(server)
      .post("/api/auth/sign-up/email")
      .send({ email, password: "Sup3rSicher!Revoke", name: "Revoke" });
    const setCookie = signupResponse.headers["set-cookie"];
    const inviteeCookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
    const inviteeUser = await adminPrisma.user.findUniqueOrThrow({ where: { email } });
    cleanupUserIds.push(inviteeUser.id);

    const acceptResponse = await request(server)
      .post("/api/v1/invitations/accept")
      .set("Cookie", inviteeCookie)
      .send({ token });
    expect(acceptResponse.status).toBe(404);
  });

  it("inviting an email that already has a User links the existing User, no duplicate", async () => {
    const admin = await signUpMember(tenantAId, "accept-admin-5", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    // An existing User (e.g. already an admin of a different tenant/person).
    const existing = await signUpMember(tenantBId, "existing-user-owner");

    const target = await createBarePerson(tenantAId, "ExistingUserTarget");
    const createResponse = await request(server)
      .post(`/api/v1/persons/${target.id}/invitations`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email: existing.email });
    const token = createResponse.body.token as string;

    const lookupResponse = await request(server).get(`/api/v1/invitations/${token}`);
    expect(lookupResponse.status).toBe(200);
    expect(lookupResponse.body.accountExists).toBe(true);

    // Existing user logs in (not signs up again) and accepts.
    const loginResponse = await request(server)
      .post("/api/auth/sign-in/email")
      .send({ email: existing.email, password: "Sup3rSicher!Test" });
    const setCookie = loginResponse.headers["set-cookie"];
    const loginCookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);

    const acceptResponse = await request(server)
      .post("/api/v1/invitations/accept")
      .set("Cookie", loginCookie)
      .send({ token });
    expect(acceptResponse.status).toBe(201);

    const usersWithEmail = await adminPrisma.user.count({ where: { email: existing.email } });
    expect(usersWithEmail).toBe(1);

    const newMembership = await adminPrisma.membership.findUnique({ where: { personId: target.id } });
    expect(newMembership?.userId).toBe(existing.userId);
  });
});

describe("Relationships API (section 27)", () => {
  it("TENANT_ADMIN can create a PARENT/child relationship", async () => {
    const admin = await signUpMember(tenantAId, "rel-admin-1", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const child = await createBarePerson(tenantAId, "RelChild1");
    const parent = await createBarePerson(tenantAId, "RelParent1");
    const response = await request(server)
      .post(`/api/v1/persons/${parent.id}/relationships`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ toPersonId: child.id, type: "LEGAL_GUARDIAN" });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("VERIFIED");
  });

  it("a relationship cannot reference a Person from a foreign tenant", async () => {
    const admin = await signUpMember(tenantAId, "rel-admin-2", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const parent = await createBarePerson(tenantAId, "RelParent2");
    const foreignChild = await createBarePerson(tenantBId, "ForeignChild");
    const response = await request(server)
      .post(`/api/v1/persons/${parent.id}/relationships`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ toPersonId: foreignChild.id, type: "LEGAL_GUARDIAN" });
    expect(response.status).toBe(404);
  });
});

describe("ReBAC — guardian/self access (sections 17-19, 27)", () => {
  it("a verified guardian can read their own child's Person", async () => {
    const admin = await signUpMember(tenantAId, "rebac-admin-1", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const child = await createBarePerson(tenantAId, "RebacChild1");
    const guardian = await signUpMember(tenantAId, "rebac-guardian-1");

    await request(server)
      .post(`/api/v1/persons/${guardian.personId}/relationships`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ toPersonId: child.id, type: "LEGAL_GUARDIAN" });

    const response = await request(server)
      .get(`/api/v1/persons/${child.id}`)
      .set("Cookie", guardian.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(child.id);
  });

  it("a verified guardian cannot read an unrelated child's Person", async () => {
    const otherChild = await createBarePerson(tenantAId, "RebacOtherChild");
    const guardian = await signUpMember(tenantAId, "rebac-guardian-2");

    const response = await request(server)
      .get(`/api/v1/persons/${otherChild.id}`)
      .set("Cookie", guardian.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });

  it("an EMERGENCY_CONTACT relationship grants no automatic access", async () => {
    const admin = await signUpMember(tenantAId, "rebac-admin-2", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const child = await createBarePerson(tenantAId, "RebacChild2");
    const contact = await signUpMember(tenantAId, "rebac-contact");

    await request(server)
      .post(`/api/v1/persons/${contact.personId}/relationships`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ toPersonId: child.id, type: "EMERGENCY_CONTACT" });

    const response = await request(server)
      .get(`/api/v1/persons/${child.id}`)
      .set("Cookie", contact.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(403);
  });

  it("a User can always read their own linked Person (SELF)", async () => {
    const plain = await signUpMember(tenantAId, "rebac-self");
    const response = await request(server)
      .get(`/api/v1/persons/${plain.personId}`)
      .set("Cookie", plain.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(plain.personId);
  });

  it("a verified guardian can read a team their child actively belongs to", async () => {
    const admin = await signUpMember(tenantAId, "rebac-admin-3", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const child = await createBarePerson(tenantAId, "RebacChild3");
    const dbA = getTenantPrisma(tenantAId);
    await dbA.teamMember.create({ data: { tenantId: tenantAId, personId: child.id, teamId: teamE1Id } });
    const guardian = await signUpMember(tenantAId, "rebac-guardian-3");
    await request(server)
      .post(`/api/v1/persons/${guardian.personId}/relationships`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ toPersonId: child.id, type: "PARENT" });

    const teamResponse = await request(server)
      .get(`/api/v1/teams/${teamE1Id}`)
      .set("Cookie", guardian.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(teamResponse.status).toBe(200);

    const teamsForChildResponse = await request(server)
      .get(`/api/v1/persons/${child.id}/teams`)
      .set("Cookie", guardian.cookie)
      .set("X-Tenant-Id", tenantAId);
    expect(teamsForChildResponse.status).toBe(200);
    expect(teamsForChildResponse.body.map((t: { id: string }) => t.id)).toContain(teamE1Id);
  });
});

describe("ReBAC end-to-end lifecycle (section 28)", () => {
  it("admin creates child+parent, links guardian relationship, invites and accepts, parent sees child but not a stranger's child", async () => {
    const admin = await signUpMember(tenantAId, "e2e-admin", [
      { role: "TENANT_ADMIN", scopeType: "TENANT" },
    ]);
    const child = await createBarePerson(tenantAId, "E2EChild");
    const parent = await createBarePerson(tenantAId, "E2EParent");
    const strangerChild = await createBarePerson(tenantAId, "E2EStrangerChild");

    const relResponse = await request(server)
      .post(`/api/v1/persons/${parent.id}/relationships`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ toPersonId: child.id, type: "LEGAL_GUARDIAN" });
    expect(relResponse.status).toBe(201);

    const email = `e2e-parent-${Date.now()}@example.invalid`;
    const inviteResponse = await request(server)
      .post(`/api/v1/persons/${parent.id}/invitations`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ email });
    expect(inviteResponse.status).toBe(201);
    const token = inviteResponse.body.token as string;

    const signupResponse = await request(server)
      .post("/api/auth/sign-up/email")
      .send({ email, password: "Sup3rSicher!E2E", name: "E2E Parent" });
    const setCookie = signupResponse.headers["set-cookie"];
    const parentCookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
    const parentUser = await adminPrisma.user.findUniqueOrThrow({ where: { email } });
    cleanupUserIds.push(parentUser.id);

    const acceptResponse = await request(server)
      .post("/api/v1/invitations/accept")
      .set("Cookie", parentCookie)
      .send({ token });
    expect(acceptResponse.status).toBe(201);

    const childVisible = await request(server)
      .get(`/api/v1/persons/${child.id}`)
      .set("Cookie", parentCookie)
      .set("X-Tenant-Id", tenantAId);
    expect(childVisible.status).toBe(200);

    const strangerHidden = await request(server)
      .get(`/api/v1/persons/${strangerChild.id}`)
      .set("Cookie", parentCookie)
      .set("X-Tenant-Id", tenantAId);
    expect(strangerHidden.status).toBe(403);
  });
});
