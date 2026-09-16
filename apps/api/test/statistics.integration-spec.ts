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
 * End-to-end verification of the Phase 21 statistics endpoint
 * (`GET /statistics/team-seasons/:id`) against a real PostgreSQL instance
 * and real better-auth sessions. Not part of `pnpm test`/CI (no DB there),
 * same reasoning as calendar-events.integration-spec.ts. Run via
 * `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let tenantBId: string;
let departmentAId: string;
let teamAId: string;
let teamSeasonAId: string;
let emptyTeamSeasonId: string;

interface AuthedMember {
  cookie: string;
  personId: string;
  userId: string;
}

const cleanupUserIds: string[] = [];

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

function getStatistics(cookie: string, tenantId: string, teamSeasonId: string) {
  return request(server).get(`/api/v1/statistics/team-seasons/${teamSeasonId}`).set("Cookie", cookie).set("X-Tenant-Id", tenantId);
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

  const tenantA = await adminPrisma.tenant.create({ data: { name: "Statistics API Test Tenant A", slug: `stats-api-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Statistics API Test Tenant B", slug: `stats-api-b-${Date.now()}` } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({ data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" } });
  const tennis = await dbA.department.create({ data: { tenantId: tenantAId, name: "Tennis", sportType: "TENNIS" } });
  departmentAId = football.id;

  const teamA = await dbA.team.create({ data: { tenantId: tenantAId, departmentId: departmentAId, name: "E1" } });
  teamAId = teamA.id;
  // Eigenes zweites Team für die "leere" TeamSeason — TeamSeason trägt ein
  // Unique(teamId, seasonId), teamAId hat in dieser Suite bereits
  // teamSeasonAId für dieselbe Saison.
  const teamEmpty = await dbA.team.create({ data: { tenantId: tenantAId, departmentId: departmentAId, name: "E-Leer" } });

  const seasonA = await dbA.season.create({ data: { tenantId: tenantAId, departmentId: departmentAId, name: "2026/2027", startsAt: new Date("2026-08-01"), endsAt: new Date("2027-06-30"), status: "ACTIVE" } });
  const ageGroupA = await dbA.ageGroup.create({ data: { tenantId: tenantAId, name: "E-Jugend", sortOrder: 1 } });

  const teamSeasonA = await dbA.teamSeason.create({ data: { tenantId: tenantAId, teamId: teamAId, seasonId: seasonA.id, ageGroupId: ageGroupA.id } });
  teamSeasonAId = teamSeasonA.id;

  const emptyTeamSeason = await dbA.teamSeason.create({ data: { tenantId: tenantAId, teamId: teamEmpty.id, seasonId: seasonA.id, ageGroupId: ageGroupA.id, displayName: "Ohne Daten" } });
  emptyTeamSeasonId = emptyTeamSeason.id;

  // 2 gewonnene, 1 unentschieden, 1 verloren, 1 zukünftiges (SCHEDULED, zählt nicht).
  await dbA.footballMatch.create({ data: { tenantId: tenantAId, teamSeasonId: teamSeasonAId, opponentName: "SV Win1", startsAt: new Date("2026-09-01T10:00:00Z"), type: "FRIENDLY", homeAway: "HOME", status: "COMPLETED", homeScore: 3, awayScore: 1 } });
  await dbA.footballMatch.create({ data: { tenantId: tenantAId, teamSeasonId: teamSeasonAId, opponentName: "SV Win2", startsAt: new Date("2026-09-08T10:00:00Z"), type: "FRIENDLY", homeAway: "AWAY", status: "COMPLETED", homeScore: 0, awayScore: 2 } });
  await dbA.footballMatch.create({ data: { tenantId: tenantAId, teamSeasonId: teamSeasonAId, opponentName: "SV Draw", startsAt: new Date("2026-09-15T10:00:00Z"), type: "FRIENDLY", homeAway: "HOME", status: "COMPLETED", homeScore: 2, awayScore: 2 } });
  await dbA.footballMatch.create({ data: { tenantId: tenantAId, teamSeasonId: teamSeasonAId, opponentName: "SV Loss", startsAt: new Date("2026-09-22T10:00:00Z"), type: "FRIENDLY", homeAway: "HOME", status: "COMPLETED", homeScore: 0, awayScore: 1 } });
  await dbA.footballMatch.create({ data: { tenantId: tenantAId, teamSeasonId: teamSeasonAId, opponentName: "SV Future", startsAt: new Date("2026-12-01T10:00:00Z"), type: "FRIENDLY", homeAway: "HOME", status: "SCHEDULED" } });

  // Ein Event mit 3 Attendance-Zeilen: 1 anwesend, 1 abwesend, 1 offen (PENDING, attended null).
  const event = await dbA.event.create({ data: { tenantId: tenantAId, teamId: teamAId, title: "Training", type: "TRAINING", startsAt: new Date("2026-09-10T17:00:00Z"), endsAt: new Date("2026-09-10T18:00:00Z") } });
  const personPresent = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Present", lastName: "Person" } });
  const personAbsent = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Absent", lastName: "Person" } });
  const personOpen = await dbA.person.create({ data: { tenantId: tenantAId, firstName: "Open", lastName: "Person" } });
  await dbA.teamMember.create({ data: { tenantId: tenantAId, teamId: teamAId, personId: personPresent.id, status: "ACTIVE" } });
  await dbA.teamMember.create({ data: { tenantId: tenantAId, teamId: teamAId, personId: personAbsent.id, status: "ACTIVE" } });
  await dbA.teamMember.create({ data: { tenantId: tenantAId, teamId: teamAId, personId: personOpen.id, status: "ACTIVE" } });
  await dbA.attendance.create({ data: { tenantId: tenantAId, eventId: event.id, personId: personPresent.id, rsvpStatus: "ACCEPTED", attended: true } });
  await dbA.attendance.create({ data: { tenantId: tenantAId, eventId: event.id, personId: personAbsent.id, rsvpStatus: "ACCEPTED", attended: false } });
  // personOpen bewusst OHNE eigene Attendance-Zeile — die Roster-Synthese
  // aus AttendancesService.list() muss sie dennoch als PENDING/offen zählen.

  const dbB = getTenantPrisma(tenantBId);
  await dbB.department.create({ data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" } });

  void tennis;
});

afterAll(async () => {
  await adminPrisma.attendance.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.event.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.teamMember.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.teamSeason.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.ageGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.season.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("GET /statistics/team-seasons/:id — happy path", () => {
  it("TENANT_ADMIN erhält die korrekt berechnete Spiel-, Tor- und Anwesenheitsbilanz", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-happy", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await getStatistics(admin.cookie, tenantAId, teamSeasonAId);
    expect(response.status).toBe(200);

    expect(response.body.matches).toEqual({
      played: 4, // das SCHEDULED-Spiel zählt nicht mit
      wins: 2,
      draws: 1,
      losses: 1,
      goalsFor: 3 + 2 + 2 + 0, // HOME 3:1, AWAY 0:2 (unsere Seite=away=2), HOME 2:2, HOME 0:1
      goalsAgainst: 1 + 0 + 2 + 1,
      goalDifference: (3 + 2 + 2 + 0) - (1 + 0 + 2 + 1),
    });

    expect(response.body.attendance.eventCount).toBe(1);
    expect(response.body.attendance.attended).toBe(1);
    expect(response.body.attendance.notAttended).toBe(1);
    expect(response.body.attendance.notRecorded).toBe(1); // personOpen — Roster-Synthese, keine eigene Zeile
    expect(response.body.attendance.attendanceRate).toBeCloseTo(0.5);
  });

  it("COACH des Teams sieht dieselbe Statistik (canOnMatch read)", async () => {
    const coach = await createAuthenticatedMember(tenantAId, "coach-happy", [{ role: "COACH", scopeType: "TEAM", teamId: teamAId }]);
    const response = await getStatistics(coach.cookie, tenantAId, teamSeasonAId);
    expect(response.status).toBe(200);
    expect(response.body.matches.played).toBe(4);
  });

  it("Sonderfall: TeamSeason ohne Spiele/Termine liefert Nullen und eine null-Quote, keinen Fehler", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-empty", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await getStatistics(admin.cookie, tenantAId, emptyTeamSeasonId);
    expect(response.status).toBe(200);
    expect(response.body.matches).toEqual({ played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 });
    expect(response.body.attendance.eventCount).toBe(0);
    expect(response.body.attendance.attendanceRate).toBeNull();
  });
});

describe("GET /statistics/team-seasons/:id — Authorization", () => {
  it("eine Person ohne jede Rolle erhält 403", async () => {
    const outsider = await createAuthenticatedMember(tenantAId, "outsider-403", []);
    const response = await getStatistics(outsider.cookie, tenantAId, teamSeasonAId);
    expect(response.status).toBe(403);
  });

  it("COACH eines ANDEREN Teams erhält 403", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const otherTeam = await dbA.team.create({ data: { tenantId: tenantAId, departmentId: departmentAId, name: "E2" } });
    const coachOther = await createAuthenticatedMember(tenantAId, "coach-other-403", [{ role: "COACH", scopeType: "TEAM", teamId: otherTeam.id }]);
    const response = await getStatistics(coachOther.cookie, tenantAId, teamSeasonAId);
    expect(response.status).toBe(403);
  });

  it("DEPARTMENT_ADMIN der Abteilung sieht die Statistik", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-200", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentAId }]);
    const response = await getStatistics(deptAdmin.cookie, tenantAId, teamSeasonAId);
    expect(response.status).toBe(200);
  });
});

describe("GET /statistics/team-seasons/:id — Validierung", () => {
  it("404 für eine nicht existierende teamSeasonId", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-404", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await getStatistics(admin.cookie, tenantAId, "00000000-0000-0000-0000-000000000000");
    expect(response.status).toBe(404);
  });

  it("400 für eine ungültige (nicht-UUID) teamSeasonId", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-400", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await getStatistics(admin.cookie, tenantAId, "not-a-uuid");
    expect(response.status).toBe(400);
  });
});

describe("Cross-Tenant-Isolation — kein Datenleak über Aggregationen", () => {
  it("Tenant B kann Tenant As Statistik nicht abrufen (404, kein Teilzugriff)", async () => {
    const adminB = await createAuthenticatedMember(tenantBId, "admin-cross-b", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await getStatistics(adminB.cookie, tenantBId, teamSeasonAId);
    expect(response.status).toBe(404);
  });
});
