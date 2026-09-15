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
 * End-to-end verification of the Phase 20 task foundation (`Task`) against
 * a real PostgreSQL instance and real better-auth sessions. Not part of
 * `pnpm test`/CI (no DB there), same reasoning as
 * calendar-events.integration-spec.ts. Run via `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let tenantBId: string;
let departmentFootballId: string;
let teamE1Id: string;
let teamE2Id: string;

interface AuthedMember {
  cookie: string;
  personId: string;
  userId: string;
}

const cleanupUserIds: string[] = [];
const cleanupPersonIds: string[] = [];

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
  cleanupPersonIds.push(person.id);
  await adminPrisma.membership.create({ data: { userId: dbUser.id, personId: person.id, status: "ACTIVE" } });

  for (const ra of roleAssignments) {
    await db.roleAssignment.create({
      data: { tenantId, personId: person.id, role: ra.role as never, scopeType: ra.scopeType, departmentId: ra.departmentId, teamId: ra.teamId },
    });
  }
  return { cookie, personId: person.id, userId: dbUser.id };
}

async function addTeamMember(tenantId: string, personId: string, teamId: string) {
  const db = getTenantPrisma(tenantId);
  await db.teamMember.create({ data: { tenantId, personId, teamId, status: "ACTIVE" } });
}

async function createBarePerson(tenantId: string, label: string) {
  const db = getTenantPrisma(tenantId);
  const person = await db.person.create({ data: { tenantId, firstName: label, lastName: "Bare" } });
  cleanupPersonIds.push(person.id);
  return person.id;
}

function createTask(cookie: string, tenantId: string, body: Record<string, unknown>) {
  return request(server).post("/api/v1/tasks").set("Cookie", cookie).set("X-Tenant-Id", tenantId).send(body);
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

  const tenantA = await adminPrisma.tenant.create({ data: { name: "Task API Test Tenant A", slug: `task-api-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Task API Test Tenant B", slug: `task-api-b-${Date.now()}` } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({ data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" } });
  departmentFootballId = football.id;

  const e1 = await dbA.team.create({ data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E1" } });
  const e2 = await dbA.team.create({ data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E2" } });
  teamE1Id = e1.id;
  teamE2Id = e2.id;

  const dbB = getTenantPrisma(tenantBId);
  await dbB.department.create({ data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" } });
});

afterAll(async () => {
  await adminPrisma.task.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  // A guardian-status test creates a verified PersonRelationship — must go
  // before the Person deleteMany below (Restrict FK on toPersonId), same
  // FK-respecting order as guardian-invitation.integration-spec.ts's own
  // afterAll cleanup.
  await adminPrisma.personRelationship.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.teamMember.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.person.deleteMany({ where: { id: { in: cleanupPersonIds } } });
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("POST /tasks — team-scoped, everyday coach task (canOnMatch semantics)", () => {
  it("TENANT_ADMIN can create a team-scoped task", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-team-create", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createTask(admin.cookie, tenantAId, { teamId: teamE1Id, title: "Trikots waschen" });
    expect(response.status).toBe(201);
    expect(response.body.teamId).toBe(teamE1Id);
    expect(response.body.canEdit).toBe(true);
    expect(response.body.status).toBe("OPEN");
  });

  it("COACH of the team can create a team-scoped task for their own team", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-create", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await createTask(coach.cookie, tenantAId, { teamId: teamE1Id, title: "Bälle aufpumpen" });
    expect(response.status).toBe(201);
  });

  it("ASSISTANT_COACH of the team CANNOT create a task (read-only, same as canOnMatch)", async () => {
    const assistant = await createAuthenticatedMember(tenantAId, "assistant-e1-create", [{ role: "ASSISTANT_COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await createTask(assistant.cookie, tenantAId, { teamId: teamE1Id, title: "Should Fail" });
    expect(response.status).toBe(403);
  });

  it("COACH of a DIFFERENT team cannot create a task for this team", async () => {
    const coachOther = await createAuthenticatedMember(tenantAId, "coach-e2-create", [{ role: "COACH", scopeType: "TEAM", teamId: teamE2Id }]);
    const response = await createTask(coachOther.cookie, tenantAId, { teamId: teamE1Id, title: "Should Fail" });
    expect(response.status).toBe(403);
  });

  it("DEPARTMENT_ADMIN of the department can create a team-scoped task", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-team-create", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId }]);
    const response = await createTask(deptAdmin.cookie, tenantAId, { teamId: teamE1Id, title: "Via Dept Admin" });
    expect(response.status).toBe(201);
  });
});

describe("POST /tasks — person-scoped, authority derived from the target's teams (ADR 0016)", () => {
  it("COACH of a team the target belongs to can create a task for that person", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-person-create", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const targetId = await createBarePerson(tenantAId, "TargetE1");
    await addTeamMember(tenantAId, targetId, teamE1Id);

    const response = await createTask(coach.cookie, tenantAId, { personId: targetId, title: "Erste-Hilfe-Set mitbringen" });
    expect(response.status).toBe(201);
    expect(response.body.personId).toBe(targetId);
  });

  it("COACH of a DIFFERENT team than any of the target's teams cannot create a task for that person", async () => {
    const coachOther = await createAuthenticatedMember(tenantAId, "coach-e2-person-create", [{ role: "COACH", scopeType: "TEAM", teamId: teamE2Id }]);
    const targetId = await createBarePerson(tenantAId, "TargetE1Only");
    await addTeamMember(tenantAId, targetId, teamE1Id);

    const response = await createTask(coachOther.cookie, tenantAId, { personId: targetId, title: "Should Fail" });
    expect(response.status).toBe(403);
  });

  it("TENANT_ADMIN can create a task for a person with NO team membership at all", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-person-no-team", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const targetId = await createBarePerson(tenantAId, "NoTeamTarget");

    const response = await createTask(admin.cookie, tenantAId, { personId: targetId, title: "Admin-only assignment" });
    expect(response.status).toBe(201);
  });

  it("COACH cannot create a task for a person with NO team membership at all (403)", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-person-no-team", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const targetId = await createBarePerson(tenantAId, "NoTeamTarget2");

    const response = await createTask(coach.cookie, tenantAId, { personId: targetId, title: "Should Fail" });
    expect(response.status).toBe(403);
  });

  it("a person on BOTH E1 and E2 can be assigned a task by either team's coach", async () => {
    const coachE2 = await createAuthenticatedMember(tenantAId, "coach-e2-multi", [{ role: "COACH", scopeType: "TEAM", teamId: teamE2Id }]);
    const targetId = await createBarePerson(tenantAId, "MultiTeamTarget");
    await addTeamMember(tenantAId, targetId, teamE1Id);
    await addTeamMember(tenantAId, targetId, teamE2Id);

    const response = await createTask(coachE2.cookie, tenantAId, { personId: targetId, title: "Via E2 coach" });
    expect(response.status).toBe(201);
  });
});

describe("POST /tasks — validation", () => {
  it("rejects both teamId and personId set", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-both-scope", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const targetId = await createBarePerson(tenantAId, "BothScope");
    const response = await createTask(admin.cookie, tenantAId, { teamId: teamE1Id, personId: targetId, title: "Invalid" });
    expect(response.status).toBe(400);
  });

  it("rejects neither teamId nor personId set", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-no-scope", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createTask(admin.cookie, tenantAId, { title: "Invalid" });
    expect(response.status).toBe(400);
  });

  it("404s for a non-existent teamId", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-bad-team", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createTask(admin.cookie, tenantAId, { teamId: "00000000-0000-0000-0000-000000000000", title: "Invalid" });
    expect(response.status).toBe(404);
  });

  it("404s for a non-existent personId", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-bad-person", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createTask(admin.cookie, tenantAId, { personId: "00000000-0000-0000-0000-000000000000", title: "Invalid" });
    expect(response.status).toBe(404);
  });
});

describe("GET /tasks/creatable-scopes", () => {
  it("TENANT_ADMIN sees every team and every person tenant-wide", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-scopes", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const target = await createBarePerson(tenantAId, "ScopesTarget");
    const response = await request(server).get("/api/v1/tasks/creatable-scopes").set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.teams.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([teamE1Id, teamE2Id]));
    expect(response.body.persons.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([target]));
  });

  it("COACH of E1 sees only E1 and only E1's active roster", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-scopes", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const e1Member = await createBarePerson(tenantAId, "E1RosterMember");
    await addTeamMember(tenantAId, e1Member, teamE1Id);
    const e2Member = await createBarePerson(tenantAId, "E2RosterMember");
    await addTeamMember(tenantAId, e2Member, teamE2Id);

    const response = await request(server).get("/api/v1/tasks/creatable-scopes").set("Cookie", coach.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.teams).toHaveLength(1);
    expect(response.body.teams[0].id).toBe(teamE1Id);
    expect(response.body.persons.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([e1Member]));
    expect(response.body.persons.map((p: { id: string }) => p.id)).not.toEqual(expect.arrayContaining([e2Member]));
  });

  it("PLAYER sees neither teams nor persons", async () => {
    const player = await createAuthenticatedMember(tenantAId, "player-scopes", [{ role: "PLAYER", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await request(server).get("/api/v1/tasks/creatable-scopes").set("Cookie", player.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.teams).toHaveLength(0);
    expect(response.body.persons).toHaveLength(0);
  });
});

describe("GET /tasks, PATCH /tasks/:id", () => {
  it("lists tasks filtered by teamId and status, and only shows tasks the caller may read", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-list", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const e1Task = await createTask(admin.cookie, tenantAId, { teamId: teamE1Id, title: "List Test E1" });
    const e2Task = await createTask(admin.cookie, tenantAId, { teamId: teamE2Id, title: "List Test E2" });

    const coachE1 = await createAuthenticatedMember(tenantAId, "coach-e1-list", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const listResponse = await request(server).get(`/api/v1/tasks?teamId=${teamE1Id}`).set("Cookie", coachE1.cookie).set("X-Tenant-Id", tenantAId);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.canCreate).toBe(true);
    expect(listResponse.body.items.some((t: { id: string }) => t.id === e1Task.body.id)).toBe(true);

    const allTasksResponse = await request(server).get("/api/v1/tasks").set("Cookie", coachE1.cookie).set("X-Tenant-Id", tenantAId);
    expect(allTasksResponse.body.items.some((t: { id: string }) => t.id === e2Task.body.id)).toBe(false);
  });

  it("COACH can update their own team's task; another team's COACH cannot", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-update-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const created = await createTask(admin.cookie, tenantAId, { teamId: teamE1Id, title: "Update Me" });

    const coachE1 = await createAuthenticatedMember(tenantAId, "coach-e1-update", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const updateResponse = await request(server).patch(`/api/v1/tasks/${created.body.id}`).set("Cookie", coachE1.cookie).set("X-Tenant-Id", tenantAId).send({ title: "Updated Title" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.title).toBe("Updated Title");

    const coachE2 = await createAuthenticatedMember(tenantAId, "coach-e2-update", [{ role: "COACH", scopeType: "TEAM", teamId: teamE2Id }]);
    const forbiddenResponse = await request(server).patch(`/api/v1/tasks/${created.body.id}`).set("Cookie", coachE2.cookie).set("X-Tenant-Id", tenantAId).send({ title: "Should Fail" });
    expect(forbiddenResponse.status).toBe(403);
  });

  it("404s for a non-existent task id", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-404", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await request(server).get(`/api/v1/tasks/00000000-0000-0000-0000-000000000000`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(404);
  });
});

describe("PATCH /tasks/:id/status — organizer and self-service", () => {
  it("the assignee themselves (no RoleAssignment at all) can mark their own task done", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-self-status-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const assignee = await createAuthenticatedMember(tenantAId, "assignee-self-status", []);
    await addTeamMember(tenantAId, assignee.personId, teamE1Id);
    const created = await createTask(admin.cookie, tenantAId, { personId: assignee.personId, title: "Self Status" });

    const response = await request(server).patch(`/api/v1/tasks/${created.body.id}/status`).set("Cookie", assignee.cookie).set("X-Tenant-Id", tenantAId).send({ status: "DONE" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("DONE");
  });

  it("a person who is neither the assignee, their guardian, nor an organizer cannot set the status (403)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-other-status-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const assignee = await createAuthenticatedMember(tenantAId, "assignee-other-status", []);
    await addTeamMember(tenantAId, assignee.personId, teamE1Id);
    const created = await createTask(admin.cookie, tenantAId, { personId: assignee.personId, title: "Other Status" });

    const outsider = await createAuthenticatedMember(tenantAId, "outsider-status", []);
    const response = await request(server).patch(`/api/v1/tasks/${created.body.id}/status`).set("Cookie", outsider.cookie).set("X-Tenant-Id", tenantAId).send({ status: "DONE" });
    expect(response.status).toBe(403);
  });

  it("a verified guardian can set the status of their child's assigned task", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-guardian-status-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const childId = await createBarePerson(tenantAId, "GuardianStatusChild");
    await addTeamMember(tenantAId, childId, teamE1Id);
    const created = await createTask(admin.cookie, tenantAId, { personId: childId, title: "Guardian Status" });

    const guardian = await createAuthenticatedMember(tenantAId, "guardian-status", []);
    const db = getTenantPrisma(tenantAId);
    await db.personRelationship.create({
      data: { tenantId: tenantAId, fromPersonId: guardian.personId, toPersonId: childId, type: "LEGAL_GUARDIAN", status: "VERIFIED", isLegalGuardian: true },
    });

    const response = await request(server).patch(`/api/v1/tasks/${created.body.id}/status`).set("Cookie", guardian.cookie).set("X-Tenant-Id", tenantAId).send({ status: "DONE" });
    expect(response.status).toBe(200);
  });

  it("for a TEAM-scoped task, only the organizer may set the status — no self-service (no single assignee)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-team-status-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const created = await createTask(admin.cookie, tenantAId, { teamId: teamE1Id, title: "Team Status" });

    const member = await createAuthenticatedMember(tenantAId, "member-team-status", []);
    await addTeamMember(tenantAId, member.personId, teamE1Id);
    const forbiddenResponse = await request(server).patch(`/api/v1/tasks/${created.body.id}/status`).set("Cookie", member.cookie).set("X-Tenant-Id", tenantAId).send({ status: "DONE" });
    expect(forbiddenResponse.status).toBe(403);

    const coachE1 = await createAuthenticatedMember(tenantAId, "coach-e1-team-status", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const okResponse = await request(server).patch(`/api/v1/tasks/${created.body.id}/status`).set("Cookie", coachE1.cookie).set("X-Tenant-Id", tenantAId).send({ status: "DONE" });
    expect(okResponse.status).toBe(200);
  });

  it("rejects an invalid status value", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-invalid-status", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const created = await createTask(admin.cookie, tenantAId, { teamId: teamE1Id, title: "Invalid Status" });
    const response = await request(server).patch(`/api/v1/tasks/${created.body.id}/status`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send({ status: "MAYBE" });
    expect(response.status).toBe(400);
  });
});

describe("DELETE /tasks/:id", () => {
  it("COACH can delete their own team's task; ASSISTANT_COACH cannot", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-delete-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const created = await createTask(admin.cookie, tenantAId, { teamId: teamE1Id, title: "Delete Me" });

    const assistant = await createAuthenticatedMember(tenantAId, "assistant-e1-delete", [{ role: "ASSISTANT_COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const forbiddenResponse = await request(server).delete(`/api/v1/tasks/${created.body.id}`).set("Cookie", assistant.cookie).set("X-Tenant-Id", tenantAId);
    expect(forbiddenResponse.status).toBe(403);

    const coachE1 = await createAuthenticatedMember(tenantAId, "coach-e1-delete", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const deleteResponse = await request(server).delete(`/api/v1/tasks/${created.body.id}`).set("Cookie", coachE1.cookie).set("X-Tenant-Id", tenantAId);
    expect(deleteResponse.status).toBe(204);

    const getResponse = await request(server).get(`/api/v1/tasks/${created.body.id}`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    expect(getResponse.status).toBe(404);
  });
});

describe("Cross-tenant isolation", () => {
  it("Tenant B cannot read, update, set status, or delete Tenant A's task", async () => {
    const adminA = await createAuthenticatedMember(tenantAId, "admin-cross-a", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const created = await createTask(adminA.cookie, tenantAId, { teamId: teamE1Id, title: "Cross-Tenant Test" });

    const adminB = await createAuthenticatedMember(tenantBId, "admin-cross-b", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const getResponse = await request(server).get(`/api/v1/tasks/${created.body.id}`).set("Cookie", adminB.cookie).set("X-Tenant-Id", tenantBId);
    expect(getResponse.status).toBe(404);

    const updateResponse = await request(server).patch(`/api/v1/tasks/${created.body.id}`).set("Cookie", adminB.cookie).set("X-Tenant-Id", tenantBId).send({ title: "Hijacked" });
    expect(updateResponse.status).toBe(404);

    const statusResponse = await request(server).patch(`/api/v1/tasks/${created.body.id}/status`).set("Cookie", adminB.cookie).set("X-Tenant-Id", tenantBId).send({ status: "DONE" });
    expect(statusResponse.status).toBe(404);

    const deleteResponse = await request(server).delete(`/api/v1/tasks/${created.body.id}`).set("Cookie", adminB.cookie).set("X-Tenant-Id", tenantBId);
    expect(deleteResponse.status).toBe(404);
  });
});
