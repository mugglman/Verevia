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
 * End-to-end verification of the Phase 19 attendance foundation
 * (`Attendance`) against a real PostgreSQL instance and real better-auth
 * sessions. Not part of `pnpm test`/CI (no DB there), same reasoning as
 * calendar-events.integration-spec.ts. Run via `pnpm test:integration`.
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
let teamEventId: string;
let departmentEventId: string;

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

async function createChildPerson(tenantId: string, label: string) {
  const db = getTenantPrisma(tenantId);
  const person = await db.person.create({ data: { tenantId, firstName: label, lastName: "Kind" } });
  cleanupPersonIds.push(person.id);
  return person.id;
}

async function verifyGuardian(tenantId: string, guardianPersonId: string, childPersonId: string) {
  const db = getTenantPrisma(tenantId);
  await db.personRelationship.create({
    data: {
      tenantId,
      fromPersonId: guardianPersonId,
      toPersonId: childPersonId,
      type: "LEGAL_GUARDIAN",
      status: "VERIFIED",
      isLegalGuardian: true,
    },
  });
}

function getAttendances(cookie: string, tenantId: string, eventId: string) {
  return request(server).get(`/api/v1/events/${eventId}/attendances`).set("Cookie", cookie).set("X-Tenant-Id", tenantId);
}

function setRsvp(cookie: string, tenantId: string, eventId: string, personId: string, body: Record<string, unknown>) {
  return request(server).put(`/api/v1/events/${eventId}/attendances/${personId}/rsvp`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send(body);
}

function markAttended(cookie: string, tenantId: string, eventId: string, personId: string, attended: boolean) {
  return request(server).put(`/api/v1/events/${eventId}/attendances/${personId}/attended`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send({ attended });
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

  const tenantA = await adminPrisma.tenant.create({ data: { name: "Attendance API Test Tenant A", slug: `attendance-api-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Attendance API Test Tenant B", slug: `attendance-api-b-${Date.now()}` } });
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

  const teamEvent = await dbA.event.create({
    data: { tenantId: tenantAId, teamId: teamE1Id, title: "Training E1", type: "TRAINING", startsAt: new Date("2026-09-10T17:00:00Z"), endsAt: new Date("2026-09-10T18:30:00Z") },
  });
  teamEventId = teamEvent.id;

  const departmentEvent = await dbA.event.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballId, title: "Abteilungsversammlung", type: "MEETING", startsAt: new Date("2026-09-15T19:00:00Z"), endsAt: new Date("2026-09-15T21:00:00Z") },
  });
  departmentEventId = departmentEvent.id;

  const dbB = getTenantPrisma(tenantBId);
  await dbB.department.create({ data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" } });
});

afterAll(async () => {
  await adminPrisma.attendance.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.event.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
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

describe("GET /events/:eventId/attendances — RBAC read (organizer)", () => {
  it("COACH of the team sees the full active roster with PENDING defaults", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-read", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const playerPersonId = await createChildPerson(tenantAId, "Roster");
    await addTeamMember(tenantAId, playerPersonId, teamE1Id);

    const response = await getAttendances(coach.cookie, tenantAId, teamEventId);
    expect(response.status).toBe(200);
    expect(response.body.canManageAttendance).toBe(true);
    expect(response.body.event.id).toBe(teamEventId);
    const rosterRow = response.body.items.find((i: { personId: string }) => i.personId === playerPersonId);
    expect(rosterRow).toBeDefined();
    expect(rosterRow.rsvpStatus).toBe("PENDING");
    expect(rosterRow.attended).toBeNull();
  });

  it("ASSISTANT_COACH (read-only role) can read but not manage attendance", async () => {
    const assistant = await createAuthenticatedMember(tenantAId, "assistant-read", [{ role: "ASSISTANT_COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await getAttendances(assistant.cookie, tenantAId, teamEventId);
    expect(response.status).toBe(200);
    expect(response.body.canManageAttendance).toBe(false);
  });

  it("COACH of a DIFFERENT team without roster overlap cannot read attendance", async () => {
    const coachOther = await createAuthenticatedMember(tenantAId, "coach-e2-read", [{ role: "COACH", scopeType: "TEAM", teamId: teamE2Id }]);
    const response = await getAttendances(coachOther.cookie, tenantAId, teamEventId);
    expect(response.status).toBe(403);
  });
});

describe("Self-service RSVP — self", () => {
  it("a plain TeamMember (no RoleAssignment at all) can RSVP for themselves", async () => {
    const player = await createAuthenticatedMember(tenantAId, "player-self", []);
    await addTeamMember(tenantAId, player.personId, teamE1Id);

    // No RBAC read role either, but eligible via self+roster.
    const readResponse = await getAttendances(player.cookie, tenantAId, teamEventId);
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.canManageAttendance).toBe(false);

    const rsvpResponse = await setRsvp(player.cookie, tenantAId, teamEventId, player.personId, { status: "ACCEPTED", note: "Bin dabei" });
    expect(rsvpResponse.status).toBe(200);
    expect(rsvpResponse.body.rsvpStatus).toBe("ACCEPTED");
    expect(rsvpResponse.body.rsvpNote).toBe("Bin dabei");
    expect(rsvpResponse.body.isSelfOrGuardianTarget).toBe(true);
  });

  it("a person NOT on the roster cannot RSVP for themselves (400)", async () => {
    const outsider = await createAuthenticatedMember(tenantAId, "outsider-self", []);
    const response = await setRsvp(outsider.cookie, tenantAId, teamEventId, outsider.personId, { status: "ACCEPTED" });
    expect(response.status).toBe(400);
  });

  it("a person cannot RSVP for someone else who is not their verified child (403)", async () => {
    const playerA = await createAuthenticatedMember(tenantAId, "player-a-self", []);
    await addTeamMember(tenantAId, playerA.personId, teamE1Id);
    const playerB = await createAuthenticatedMember(tenantAId, "player-b-self", []);
    await addTeamMember(tenantAId, playerB.personId, teamE1Id);

    const response = await setRsvp(playerA.cookie, tenantAId, teamEventId, playerB.personId, { status: "ACCEPTED" });
    expect(response.status).toBe(403);
  });

  it("resubmitting an RSVP updates the same row, not a new one (idempotent double-submit)", async () => {
    const player = await createAuthenticatedMember(tenantAId, "player-resubmit", []);
    await addTeamMember(tenantAId, player.personId, teamE1Id);

    const first = await setRsvp(player.cookie, tenantAId, teamEventId, player.personId, { status: "ACCEPTED" });
    expect(first.status).toBe(200);
    const second = await setRsvp(player.cookie, tenantAId, teamEventId, player.personId, { status: "DECLINED" });
    expect(second.status).toBe(200);
    expect(second.body.rsvpStatus).toBe("DECLINED");

    const count = await adminPrisma.attendance.count({ where: { eventId: teamEventId, personId: player.personId } });
    expect(count).toBe(1);
  });

  it("two near-simultaneous RSVP submissions for the same person settle on exactly one row", async () => {
    const player = await createAuthenticatedMember(tenantAId, "player-concurrent", []);
    await addTeamMember(tenantAId, player.personId, teamE1Id);

    const [r1, r2] = await Promise.all([
      setRsvp(player.cookie, tenantAId, teamEventId, player.personId, { status: "ACCEPTED" }),
      setRsvp(player.cookie, tenantAId, teamEventId, player.personId, { status: "DECLINED" }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);

    const count = await adminPrisma.attendance.count({ where: { eventId: teamEventId, personId: player.personId } });
    expect(count).toBe(1);
  });
});

describe("Self-service RSVP — guardian on behalf of a verified child", () => {
  it("a verified guardian can RSVP for their child if the child is on the roster", async () => {
    const guardian = await createAuthenticatedMember(tenantAId, "guardian-child", []);
    const childId = await createChildPerson(tenantAId, "GuardianKind");
    await addTeamMember(tenantAId, childId, teamE1Id);
    await verifyGuardian(tenantAId, guardian.personId, childId);

    const response = await setRsvp(guardian.cookie, tenantAId, teamEventId, childId, { status: "ACCEPTED" });
    expect(response.status).toBe(200);
    expect(response.body.personId).toBe(childId);
    expect(response.body.isSelfOrGuardianTarget).toBe(true);
  });

  it("a guardian cannot RSVP for a child who is NOT verified (PENDING relationship)", async () => {
    const guardian = await createAuthenticatedMember(tenantAId, "guardian-unverified", []);
    const childId = await createChildPerson(tenantAId, "UnverifiedKind");
    await addTeamMember(tenantAId, childId, teamE1Id);
    const db = getTenantPrisma(tenantAId);
    await db.personRelationship.create({
      data: { tenantId: tenantAId, fromPersonId: guardian.personId, toPersonId: childId, type: "LEGAL_GUARDIAN", status: "PENDING" },
    });

    const response = await setRsvp(guardian.cookie, tenantAId, teamEventId, childId, { status: "ACCEPTED" });
    expect(response.status).toBe(403);
  });

  it("a guardian cannot RSVP for a verified child who is NOT on the event's roster", async () => {
    const guardian = await createAuthenticatedMember(tenantAId, "guardian-not-roster", []);
    const childId = await createChildPerson(tenantAId, "NotRosterKind");
    await verifyGuardian(tenantAId, guardian.personId, childId);

    const response = await setRsvp(guardian.cookie, tenantAId, teamEventId, childId, { status: "ACCEPTED" });
    expect(response.status).toBe(400);
  });
});

describe("Organizer — marking actual attendance", () => {
  it("COACH can mark a roster member as attended", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-mark", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const playerId = await createChildPerson(tenantAId, "MarkMe");
    await addTeamMember(tenantAId, playerId, teamE1Id);

    const response = await markAttended(coach.cookie, tenantAId, teamEventId, playerId, true);
    expect(response.status).toBe(200);
    expect(response.body.attended).toBe(true);
  });

  it("a self-service-only caller (no manage permission) cannot mark attendance, even for themselves", async () => {
    const player = await createAuthenticatedMember(tenantAId, "player-mark-self", []);
    await addTeamMember(tenantAId, player.personId, teamE1Id);

    const response = await markAttended(player.cookie, tenantAId, teamEventId, player.personId, true);
    expect(response.status).toBe(403);
  });

  it("COACH cannot mark attendance for a person not on the roster (400)", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-mark-invalid", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const outsider = await createAuthenticatedMember(tenantAId, "outsider-mark", []);

    const response = await markAttended(coach.cookie, tenantAId, teamEventId, outsider.personId, true);
    expect(response.status).toBe(400);
  });

  it("COACH of a different team cannot mark attendance for this event (403)", async () => {
    const coachOther = await createAuthenticatedMember(tenantAId, "coach-e2-mark", [{ role: "COACH", scopeType: "TEAM", teamId: teamE2Id }]);
    const playerId = await createChildPerson(tenantAId, "MarkMeOther");
    await addTeamMember(tenantAId, playerId, teamE1Id);

    const response = await markAttended(coachOther.cookie, tenantAId, teamEventId, playerId, true);
    expect(response.status).toBe(403);
  });
});

describe("Department-scoped event — RoleAssignment-based roster", () => {
  it("a COACH of a team within the department is on the roster and can RSVP for themselves", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-dept-event", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);
    const response = await setRsvp(coach.cookie, tenantAId, departmentEventId, coach.personId, { status: "ACCEPTED" });
    expect(response.status).toBe(200);
  });

  it("a person with a role in a DIFFERENT department is not eligible (400)", async () => {
    const tennisCoach = await createAuthenticatedMember(tenantAId, "coach-tennis-dept-event", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentTennisId }]);
    const response = await setRsvp(tennisCoach.cookie, tenantAId, departmentEventId, tennisCoach.personId, { status: "ACCEPTED" });
    expect(response.status).toBe(400);
  });

  it("DEPARTMENT_ADMIN can manage/mark attendance for the department event", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-mark", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId }]);
    const response = await markAttended(deptAdmin.cookie, tenantAId, departmentEventId, deptAdmin.personId, true);
    expect(response.status).toBe(200);
  });
});

describe("Validation and not-found", () => {
  it("404s for a non-existent event id", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-404", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await getAttendances(admin.cookie, tenantAId, "00000000-0000-0000-0000-000000000000");
    expect(response.status).toBe(404);
  });

  it("rejects an invalid rsvpStatus value", async () => {
    const player = await createAuthenticatedMember(tenantAId, "player-invalid-status", []);
    await addTeamMember(tenantAId, player.personId, teamE1Id);
    const response = await setRsvp(player.cookie, tenantAId, teamEventId, player.personId, { status: "MAYBE" });
    expect(response.status).toBe(400);
  });
});

describe("Cross-tenant isolation", () => {
  it("Tenant B cannot read or write attendance for Tenant A's event", async () => {
    const adminB = await createAuthenticatedMember(tenantBId, "admin-cross-b", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);

    const readResponse = await getAttendances(adminB.cookie, tenantBId, teamEventId);
    expect(readResponse.status).toBe(404);

    const rsvpResponse = await setRsvp(adminB.cookie, tenantBId, teamEventId, adminB.personId, { status: "ACCEPTED" });
    expect(rsvpResponse.status).toBe(404);
  });
});
