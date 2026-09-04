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
 * End-to-end verification of the Phase 18 calendar/event foundation
 * (`Event`) against a real PostgreSQL instance and real better-auth
 * sessions. Not part of `pnpm test`/CI (no DB there), same reasoning as
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
let teamE2Id: string;
let seasonFootballId: string;
let venueId: string;

interface AuthedMember {
  cookie: string;
  personId: string;
  userId: string;
}

const cleanupUserIds: string[] = [];
const cleanupEventIds: string[] = [];

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

function createEvent(cookie: string, tenantId: string, body: Record<string, unknown>) {
  return request(server).post("/api/v1/events").set("Cookie", cookie).set("X-Tenant-Id", tenantId).send(body);
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

  const tenantA = await adminPrisma.tenant.create({ data: { name: "Calendar Events API Test Tenant A", slug: `calendar-events-api-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Calendar Events API Test Tenant B", slug: `calendar-events-api-b-${Date.now()}` } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({ data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" } });
  const tennis = await dbA.department.create({ data: { tenantId: tenantAId, name: "Tennis", sportType: "TENNIS" } });
  departmentFootballId = football.id;
  departmentTennisId = tennis.id;

  const e1 = await dbA.team.create({ data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E1" } });
  const e2 = await dbA.team.create({ data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E2" } });
  teamE1Id = e1.id;
  teamE2Id = e2.id;

  const season = await dbA.season.create({ data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "2026/2027", startsAt: new Date("2026-08-01"), endsAt: new Date("2027-06-30"), status: "ACTIVE" } });
  seasonFootballId = season.id;

  const venue = await dbA.venue.create({ data: { tenantId: tenantAId, name: "Sportplatz Test" } });
  venueId = venue.id;

  const dbB = getTenantPrisma(tenantBId);
  await dbB.department.create({ data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" } });
});

afterAll(async () => {
  await adminPrisma.event.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.season.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.venue.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("POST /events — team-scoped, everyday coach task (canOnMatch semantics)", () => {
  it("TENANT_ADMIN can create a team-scoped event", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-team-create", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createEvent(admin.cookie, tenantAId, { teamId: teamE1Id, title: "Training E1", type: "TRAINING", startsAt: "2026-09-10T17:00:00.000Z", endsAt: "2026-09-10T18:30:00.000Z" });
    expect(response.status).toBe(201);
    expect(response.body.teamId).toBe(teamE1Id);
    expect(response.body.canEdit).toBe(true);
    cleanupEventIds.push(response.body.id);
  });

  it("COACH of the team can create a team-scoped event for their own team", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-create", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await createEvent(coach.cookie, tenantAId, { teamId: teamE1Id, title: "Training E1 (Coach)", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:30:00.000Z" });
    expect(response.status).toBe(201);
    cleanupEventIds.push(response.body.id);
  });

  it("TEAM_MANAGER of the team can create a team-scoped event", async () => {
    const manager = await createAuthenticatedMember(tenantAId, "manager-e1-create", [{ role: "TEAM_MANAGER", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await createEvent(manager.cookie, tenantAId, { teamId: teamE1Id, title: "Besprechung E1", type: "MEETING", startsAt: "2026-09-11T19:00:00.000Z", endsAt: "2026-09-11T20:00:00.000Z" });
    expect(response.status).toBe(201);
    cleanupEventIds.push(response.body.id);
  });

  it("ASSISTANT_COACH of the team CANNOT create an event (read-only, same as canOnMatch)", async () => {
    const assistant = await createAuthenticatedMember(tenantAId, "assistant-e1-create", [{ role: "ASSISTANT_COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await createEvent(assistant.cookie, tenantAId, { teamId: teamE1Id, title: "Should Fail", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z" });
    expect(response.status).toBe(403);
  });

  it("COACH of a DIFFERENT team cannot create an event for this team", async () => {
    const coachOther = await createAuthenticatedMember(tenantAId, "coach-e2-create", [{ role: "COACH", scopeType: "TEAM", teamId: teamE2Id }]);
    const response = await createEvent(coachOther.cookie, tenantAId, { teamId: teamE1Id, title: "Should Fail", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z" });
    expect(response.status).toBe(403);
  });

  it("DEPARTMENT_ADMIN of the department can create a team-scoped event", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-team-create", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId }]);
    const response = await createEvent(deptAdmin.cookie, tenantAId, { teamId: teamE1Id, title: "Training via Dept Admin", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z" });
    expect(response.status).toBe(201);
    cleanupEventIds.push(response.body.id);
  });
});

describe("POST /events — department-scoped, administrative (canOnSeason semantics)", () => {
  it("DEPARTMENT_ADMIN can create a department-scoped event", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-dept-create", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId }]);
    const response = await createEvent(deptAdmin.cookie, tenantAId, { departmentId: departmentFootballId, title: "Abteilungsversammlung", type: "MEETING", startsAt: "2026-09-15T19:00:00.000Z", endsAt: "2026-09-15T21:00:00.000Z" });
    expect(response.status).toBe(201);
    cleanupEventIds.push(response.body.id);
  });

  it("COACH CANNOT create a department-scoped event (administrative, not a day-to-day coach task)", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-dept-create", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await createEvent(coach.cookie, tenantAId, { departmentId: departmentFootballId, title: "Should Fail", startsAt: "2026-09-15T19:00:00.000Z", endsAt: "2026-09-15T21:00:00.000Z" });
    expect(response.status).toBe(403);
  });

  it("DEPARTMENT_ADMIN of a DIFFERENT department cannot create an event for this department", async () => {
    const tennisAdmin = await createAuthenticatedMember(tenantAId, "tennis-admin-dept-create", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentTennisId }]);
    const response = await createEvent(tennisAdmin.cookie, tenantAId, { departmentId: departmentFootballId, title: "Should Fail", startsAt: "2026-09-15T19:00:00.000Z", endsAt: "2026-09-15T21:00:00.000Z" });
    expect(response.status).toBe(403);
  });
});

describe("POST /events — validation", () => {
  it("rejects both teamId and departmentId set", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-both-scope", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createEvent(admin.cookie, tenantAId, { teamId: teamE1Id, departmentId: departmentFootballId, title: "Invalid", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z" });
    expect(response.status).toBe(400);
  });

  it("rejects neither teamId nor departmentId set", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-no-scope", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createEvent(admin.cookie, tenantAId, { title: "Invalid", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z" });
    expect(response.status).toBe(400);
  });

  it("rejects endsAt before startsAt", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-bad-range", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createEvent(admin.cookie, tenantAId, { teamId: teamE1Id, title: "Invalid Range", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T17:00:00.000Z" });
    expect(response.status).toBe(400);
  });

  it("404s for a non-existent teamId", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-bad-team", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createEvent(admin.cookie, tenantAId, { teamId: "00000000-0000-0000-0000-000000000000", title: "Invalid", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z" });
    expect(response.status).toBe(404);
  });

  it("rejects a seasonId that belongs to a different department", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-bad-season", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const dbA = getTenantPrisma(tenantAId);
    const tennisSeason = await dbA.season.create({ data: { tenantId: tenantAId, departmentId: departmentTennisId, name: "Tennis 2026", startsAt: new Date("2026-04-01"), endsAt: new Date("2026-10-31"), status: "ACTIVE" } });
    const response = await createEvent(admin.cookie, tenantAId, { teamId: teamE1Id, seasonId: tennisSeason.id, title: "Invalid Season", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z" });
    expect(response.status).toBe(400);
    await adminPrisma.season.delete({ where: { id: tennisSeason.id } });
  });

  it("accepts a seasonId and venueId that belong to the correct department/tenant", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-good-season", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await createEvent(admin.cookie, tenantAId, { teamId: teamE1Id, seasonId: seasonFootballId, venueId, title: "Fully Scoped", startsAt: "2026-09-11T17:00:00.000Z", endsAt: "2026-09-11T18:00:00.000Z" });
    expect(response.status).toBe(201);
    expect(response.body.seasonName).toBe("2026/2027");
    expect(response.body.venueName).toBe("Sportplatz Test");
    cleanupEventIds.push(response.body.id);
  });
});

describe("GET /events, PATCH /events/:id, DELETE /events/:id", () => {
  it("lists events filtered by teamId and date range, and only shows events the caller may read", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-list", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const e1Event = await createEvent(admin.cookie, tenantAId, { teamId: teamE1Id, title: "List Test E1", startsAt: "2026-10-01T17:00:00.000Z", endsAt: "2026-10-01T18:00:00.000Z" });
    const e2Event = await createEvent(admin.cookie, tenantAId, { teamId: teamE2Id, title: "List Test E2", startsAt: "2026-10-01T17:00:00.000Z", endsAt: "2026-10-01T18:00:00.000Z" });
    cleanupEventIds.push(e1Event.body.id, e2Event.body.id);

    const coachE1 = await createAuthenticatedMember(tenantAId, "coach-e1-list", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const listResponse = await request(server).get(`/api/v1/events?teamId=${teamE1Id}&from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z`).set("Cookie", coachE1.cookie).set("X-Tenant-Id", tenantAId);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.canCreate).toBe(true);
    expect(listResponse.body.items.some((e: { id: string }) => e.id === e1Event.body.id)).toBe(true);

    // COACH E1 reading E2's events directly (no teamId filter) never sees them — canOnMatch read is team-scoped.
    const allEventsResponse = await request(server).get("/api/v1/events").set("Cookie", coachE1.cookie).set("X-Tenant-Id", tenantAId);
    expect(allEventsResponse.body.items.some((e: { id: string }) => e.id === e2Event.body.id)).toBe(false);
  });

  it("canCreate is false for a caller with no create-eligible role anywhere (e.g. PLAYER)", async () => {
    const player = await createAuthenticatedMember(tenantAId, "player-list", [{ role: "PLAYER", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await request(server).get("/api/v1/events").set("Cookie", player.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.canCreate).toBe(false);
  });
});

describe("GET /events/creatable-scopes", () => {
  it("TENANT_ADMIN sees every team and department", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-scopes", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await request(server).get("/api/v1/events/creatable-scopes").set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.teams.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([teamE1Id, teamE2Id]));
    expect(response.body.departments.map((d: { id: string }) => d.id)).toEqual(expect.arrayContaining([departmentFootballId, departmentTennisId]));
  });

  it("COACH of E1 sees only E1, and no departments", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-scopes", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await request(server).get("/api/v1/events/creatable-scopes").set("Cookie", coach.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.teams).toHaveLength(1);
    expect(response.body.teams[0].id).toBe(teamE1Id);
    expect(response.body.departments).toHaveLength(0);
  });

  it("PLAYER sees neither teams nor departments", async () => {
    const playerScopes = await createAuthenticatedMember(tenantAId, "player-scopes", [{ role: "PLAYER", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await request(server).get("/api/v1/events/creatable-scopes").set("Cookie", playerScopes.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.teams).toHaveLength(0);
    expect(response.body.departments).toHaveLength(0);
  });

  it("DEPARTMENT_ADMIN sees their department and every team within it, not other departments", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-scopes", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId }]);
    const response = await request(server).get("/api/v1/events/creatable-scopes").set("Cookie", deptAdmin.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(200);
    expect(response.body.departments.map((d: { id: string }) => d.id)).toEqual([departmentFootballId]);
    expect(response.body.teams.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([teamE1Id, teamE2Id]));
  });

  it("COACH can update their own team's event; another team's COACH cannot", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-update-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const created = await createEvent(admin.cookie, tenantAId, { teamId: teamE1Id, title: "Update Me", startsAt: "2026-10-05T17:00:00.000Z", endsAt: "2026-10-05T18:00:00.000Z" });
    cleanupEventIds.push(created.body.id);

    const coachE1 = await createAuthenticatedMember(tenantAId, "coach-e1-update", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const updateResponse = await request(server).patch(`/api/v1/events/${created.body.id}`).set("Cookie", coachE1.cookie).set("X-Tenant-Id", tenantAId).send({ title: "Updated Title" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.title).toBe("Updated Title");

    const coachE2 = await createAuthenticatedMember(tenantAId, "coach-e2-update", [{ role: "COACH", scopeType: "TEAM", teamId: teamE2Id }]);
    const forbiddenResponse = await request(server).patch(`/api/v1/events/${created.body.id}`).set("Cookie", coachE2.cookie).set("X-Tenant-Id", tenantAId).send({ title: "Should Fail" });
    expect(forbiddenResponse.status).toBe(403);
  });

  it("COACH can delete their own team's event; ASSISTANT_COACH cannot", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-delete-setup", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const created = await createEvent(admin.cookie, tenantAId, { teamId: teamE1Id, title: "Delete Me", startsAt: "2026-10-06T17:00:00.000Z", endsAt: "2026-10-06T18:00:00.000Z" });

    const assistant = await createAuthenticatedMember(tenantAId, "assistant-e1-delete", [{ role: "ASSISTANT_COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const forbiddenResponse = await request(server).delete(`/api/v1/events/${created.body.id}`).set("Cookie", assistant.cookie).set("X-Tenant-Id", tenantAId);
    expect(forbiddenResponse.status).toBe(403);

    const coachE1 = await createAuthenticatedMember(tenantAId, "coach-e1-delete", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const deleteResponse = await request(server).delete(`/api/v1/events/${created.body.id}`).set("Cookie", coachE1.cookie).set("X-Tenant-Id", tenantAId);
    expect(deleteResponse.status).toBe(204);

    const getResponse = await request(server).get(`/api/v1/events/${created.body.id}`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    expect(getResponse.status).toBe(404);
  });

  it("404s for a non-existent event id", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-404", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await request(server).get(`/api/v1/events/00000000-0000-0000-0000-000000000000`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId);
    expect(response.status).toBe(404);
  });
});

describe("Cross-tenant isolation", () => {
  it("Tenant B cannot read, update, or delete Tenant A's event", async () => {
    const adminA = await createAuthenticatedMember(tenantAId, "admin-cross-a", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const created = await createEvent(adminA.cookie, tenantAId, { teamId: teamE1Id, title: "Cross-Tenant Test", startsAt: "2026-10-07T17:00:00.000Z", endsAt: "2026-10-07T18:00:00.000Z" });
    cleanupEventIds.push(created.body.id);

    const adminB = await createAuthenticatedMember(tenantBId, "admin-cross-b", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const getResponse = await request(server).get(`/api/v1/events/${created.body.id}`).set("Cookie", adminB.cookie).set("X-Tenant-Id", tenantBId);
    expect(getResponse.status).toBe(404);

    const updateResponse = await request(server).patch(`/api/v1/events/${created.body.id}`).set("Cookie", adminB.cookie).set("X-Tenant-Id", tenantBId).send({ title: "Hijacked" });
    expect(updateResponse.status).toBe(404);

    const deleteResponse = await request(server).delete(`/api/v1/events/${created.body.id}`).set("Cookie", adminB.cookie).set("X-Tenant-Id", tenantBId);
    expect(deleteResponse.status).toBe(404);
  });
});
