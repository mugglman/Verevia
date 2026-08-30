import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { INestApplication, RequestMethod, ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@verevia/auth";
import { createAdminPrismaForTests, getTenantPrisma } from "@verevia/database";
import { AppModule } from "../src/app.module";

/**
 * End-to-end verification of the Phase 13 knockout/final-round bracket
 * generator (preview/commit) against a real PostgreSQL instance and real
 * better-auth sessions. Not part of `pnpm test`/CI (no DB there), same
 * reasoning as tournament-schedule.integration-spec.ts. Run via
 * `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let departmentFootballId: string;
let departmentTennisId: string;
let teamE1Id: string;
let venueId: string;

interface AuthedMember {
  cookie: string;
  personId: string;
  userId: string;
}

const cleanupUserIds: string[] = [];
const cleanupTournamentIds: string[] = [];

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

function defaultSettings(overrides: Partial<{ entrants: unknown[]; includeThirdPlace: boolean; matchDurationMinutes: number; changeoverMinutes: number; minimumRestMinutes: number; venueIds: string[] }> = {}) {
  return {
    // Two syntactically valid (but not necessarily resolvable) entrants by
    // default — CreateKnockoutPreviewDto enforces @ArrayMinSize(2) and
    // @IsUUID() at the HTTP boundary, which runs before any
    // auth/tournament-lookup logic in the service. Tests that only care
    // about auth/routing behavior (not entrant resolution) rely on this
    // default; tests that exercise entrant resolution pass their own.
    entrants: [
      { type: "TEAM", participantId: randomUUID() },
      { type: "TEAM", participantId: randomUUID() },
    ],
    includeThirdPlace: false,
    matchDurationMinutes: 10,
    changeoverMinutes: 2,
    minimumRestMinutes: 10,
    venueIds: [venueId],
    ...overrides,
  };
}

/** Creates a knockout-ready tournament (N external participants, venue assigned) via the real API. */
async function createKnockoutTournament(cookie: string, options: { participantCount?: number; mode?: string; assignVenue?: boolean } = {}) {
  const { participantCount = 4, mode = "KNOCKOUT", assignVenue = true } = options;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const tournamentResponse = await request(server)
    .post("/api/v1/football/tournaments")
    .set("Cookie", cookie)
    .set("X-Tenant-Id", tenantAId)
    .send({ departmentId: departmentFootballId, name: `Knockout Test Cup ${suffix}`, mode, startsAt: "2026-12-05T09:00:00.000Z", endsAt: "2026-12-05T20:00:00.000Z" });
  const tournamentId = tournamentResponse.body.id as string;
  cleanupTournamentIds.push(tournamentId);

  const participantIds: string[] = [];
  for (let i = 0; i < participantCount; i++) {
    const participantResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/participants`)
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ externalName: `Knockout Test Team ${suffix}-${i}` });
    participantIds.push(participantResponse.body.id as string);
  }

  if (assignVenue) {
    await request(server).post(`/api/v1/football/tournaments/${tournamentId}/venues`).set("Cookie", cookie).set("X-Tenant-Id", tenantAId).send({ venueId });
  }

  return { tournamentId, participantIds };
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

  const tenantA = await adminPrisma.tenant.create({ data: { name: "Knockout API Test Tenant A", slug: `knockout-api-a-${Date.now()}` } });
  tenantAId = tenantA.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({ data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" } });
  const tennis = await dbA.department.create({ data: { tenantId: tenantAId, name: "Tennis", sportType: "TENNIS" } });
  departmentFootballId = football.id;
  departmentTennisId = tennis.id;

  const e1 = await dbA.team.create({ data: { tenantId: tenantAId, departmentId: departmentFootballId, name: "E1" } });
  teamE1Id = e1.id;

  const venue = await dbA.venue.create({ data: { tenantId: tenantAId, name: "Sportplatz Test" } });
  venueId = venue.id;
});

afterAll(async () => {
  await adminPrisma.tournamentMatchSlot.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.tournamentParticipant.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.tournamentGroup.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.tournamentVenue.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.footballTournament.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.venue.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.person.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.department.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.tenant.deleteMany({ where: { id: tenantAId } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("Knockout preview/commit — auth baseline", () => {
  it("POST preview without a session → 401", async () => {
    const response = await request(server)
      .post("/api/v1/football/tournaments/00000000-0000-0000-0000-000000000000/knockout/preview")
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(response.status).toBe(401);
  });
});

describe("Knockout preview/commit — authorization", () => {
  it("TENANT_ADMIN can preview (200) and commit (201)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(admin.cookie);
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings({ entrants }));
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.body.valid).toBe(true);
    expect(previewResponse.body.matches).toHaveLength(3); // 4 entrants → SF-1, SF-2, FINAL

    const commitResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings({ entrants }), fingerprint: previewResponse.body.fingerprint });
    expect(commitResponse.status).toBe(201);
    expect(commitResponse.body.createdMatchCount).toBe(3);
  });

  it("DEPARTMENT_ADMIN Fußball can preview and commit in their own department", async () => {
    const deptAdmin = await createAuthenticatedMember(tenantAId, "dept-admin-knockout", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentFootballId }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(deptAdmin.cookie);
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings({ entrants }));
    expect(previewResponse.status).toBe(200);

    const commitResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`)
      .set("Cookie", deptAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings({ entrants }), fingerprint: previewResponse.body.fingerprint });
    expect(commitResponse.status).toBe(201);
  });

  it("DEPARTMENT_ADMIN of a DIFFERENT department is forbidden", async () => {
    const tennisAdmin = await createAuthenticatedMember(tenantAId, "tennis-admin-knockout", [{ role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: departmentTennisId }]);
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-setup2", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId } = await createKnockoutTournament(admin.cookie);

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`)
      .set("Cookie", tennisAdmin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(response.status).toBe(403);
  });

  it("COACH is forbidden from previewing and committing", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-setup3", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId } = await createKnockoutTournament(admin.cookie);
    const coach = await createAuthenticatedMember(tenantAId, "coach-e1-knockout", [{ role: "COACH", scopeType: "TEAM", teamId: teamE1Id }]);

    const previewResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(previewResponse.status).toBe(403);

    const commitResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`)
      .set("Cookie", coach.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings(), fingerprint: "irrelevant" });
    expect(commitResponse.status).toBe(403);
  });
});

describe("Knockout preview", () => {
  it("creates 0 FootballMatch rows", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-preview-noop", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(admin.cookie);
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings({ entrants }));

    const matchCount = await adminPrisma.footballMatch.count({ where: { tournamentId } });
    expect(matchCount).toBe(0);
  });

  it("is deterministic for identical settings", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-deterministic", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(admin.cookie);
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    const first = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send(defaultSettings({ entrants }));
    const second = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send(defaultSettings({ entrants }));
    expect(second.body.fingerprint).toBe(first.body.fingerprint);
  });

  it("rejects a venue not assigned to the tournament (400)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-wrong-venue", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(admin.cookie, { assignVenue: false });
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));
    const dbA = getTenantPrisma(tenantAId);
    const unassignedVenue = await dbA.venue.create({ data: { tenantId: tenantAId, name: "Unassigned Venue" } });

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings({ entrants, venueIds: [unassignedVenue.id] }));
    expect(response.status).toBe(400);
  });

  it("rejects an entrant referencing a participant not in this tournament (404)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-unknown-entrant", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId } = await createKnockoutTournament(admin.cookie, { participantCount: 0 });

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings({ entrants: [{ type: "TEAM", participantId: randomUUID() }, { type: "TEAM", participantId: randomUUID() }] }));
    expect(response.status).toBe(404);
  });

  it("rejects includeThirdPlace with only 2 entrants (structurally impossible — no semifinal round)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-thirdplace-invalid", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(admin.cookie, { participantCount: 2 });
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings({ entrants, includeThirdPlace: true }));
    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(false);
    expect(response.body.conflicts.length).toBeGreaterThan(0);
  });

  it("reports a tournament-end conflict as valid:false with a clear message, not an error", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-tight-end", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const tournamentResponse = await request(server)
      .post("/api/v1/football/tournaments")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ departmentId: departmentFootballId, name: `Knockout Tight End ${Date.now()}`, mode: "KNOCKOUT", startsAt: "2026-12-05T09:00:00.000Z", endsAt: "2026-12-05T09:15:00.000Z" });
    const tournamentId = tournamentResponse.body.id as string;
    cleanupTournamentIds.push(tournamentId);
    await request(server).post(`/api/v1/football/tournaments/${tournamentId}/venues`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send({ venueId });
    const participantIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const p = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/participants`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send({ externalName: `Tight End Team ${Date.now()}-${i}` });
      participantIds.push(p.body.id);
    }
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    const response = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings({ entrants }));
    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(false);
    expect(response.body.conflicts.length).toBeGreaterThan(0);
  });

  it("returns 404 for a non-existent tournament", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-404", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const response = await request(server)
      .post("/api/v1/football/tournaments/00000000-0000-0000-0000-000000000000/knockout/preview")
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send(defaultSettings());
    expect(response.status).toBe(404);
  });
});

describe("Knockout commit", () => {
  it("rejects a stale preview after the tournament state changed (409)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-stale", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(admin.cookie);
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    const previewResponse = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send(defaultSettings({ entrants }));

    // Change settings between preview and commit (different match duration).
    const commitResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings({ entrants, matchDurationMinutes: 15 }), fingerprint: previewResponse.body.fingerprint });
    expect(commitResponse.status).toBe(409);

    const matchCount = await adminPrisma.footballMatch.count({ where: { tournamentId } });
    expect(matchCount).toBe(0);
  });

  it("rejects committing a bracket when a schedule already exists (409) — reuses the same tournament-wide guard as round-robin", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-existing", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(admin.cookie);
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    const firstPreview = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send(defaultSettings({ entrants }));
    const firstCommit = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings({ entrants }), fingerprint: firstPreview.body.fingerprint });
    expect(firstCommit.status).toBe(201);

    const secondPreview = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send(defaultSettings({ entrants }));
    const secondCommit = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings({ entrants }), fingerprint: secondPreview.body.fingerprint });
    expect(secondCommit.status).toBe(409);

    const matchCount = await adminPrisma.footballMatch.count({ where: { tournamentId } });
    expect(matchCount).toBe(3);
  });

  it("persists matches and pending slots with the correct fields", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-fields", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(admin.cookie);
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    const previewResponse = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send(defaultSettings({ entrants }));
    await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ ...defaultSettings({ entrants }), fingerprint: previewResponse.body.fingerprint });

    const persisted = await adminPrisma.footballMatch.findMany({ where: { tournamentId } });
    expect(persisted).toHaveLength(3); // SF-1, SF-2, FINAL
    for (const match of persisted) {
      expect(match.type).toBe("TOURNAMENT");
      expect(match.homeAway).toBe("NEUTRAL");
      expect(match.status).toBe("SCHEDULED");
      expect(match.tournamentGroupId).toBeNull();
    }
    const finalMatch = persisted.find((m) => m.homeParticipantId === null && m.awayParticipantId === null);
    expect(finalMatch).toBeDefined(); // FINAL: both sides pending (WINNER_OF_MATCH)

    const slots = await adminPrisma.tournamentMatchSlot.findMany({ where: { tournamentId } });
    expect(slots).toHaveLength(2); // FINAL's home + away, both WINNER_OF_MATCH
    for (const slot of slots) {
      expect(slot.sourceType).toBe("WINNER_OF_MATCH");
      expect(slot.matchId).toBe(finalMatch!.id);
    }

    // The Final's two pending sides must stay distinguishable — both are
    // "Sieger Halbfinale" sources, so the label needs the per-round match
    // index (see TournamentKnockoutService.describeSource) or a user could
    // never tell which semifinal winner is which in the preview/UI.
    const finalPreviewMatch = previewResponse.body.matches.find((m: { key: string }) => m.key === "FINAL");
    expect(finalPreviewMatch.homeLabel).toBe("Sieger Halbfinale 1");
    expect(finalPreviewMatch.awayLabel).toBe("Sieger Halbfinale 2");
  });

  it("two near-simultaneous commits for the same tournament: exactly one succeeds, the other is rejected, no duplicate matches", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "tenant-admin-knockout-concurrent", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createKnockoutTournament(admin.cookie);
    const entrants = participantIds.map((id) => ({ type: "TEAM", participantId: id }));

    const previewResponse = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/preview`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send(defaultSettings({ entrants }));
    const commitBody = { ...defaultSettings({ entrants }), fingerprint: previewResponse.body.fingerprint };

    const [responseA, responseB] = await Promise.all([
      request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send(commitBody),
      request(server).post(`/api/v1/football/tournaments/${tournamentId}/knockout/commit`).set("Cookie", admin.cookie).set("X-Tenant-Id", tenantAId).send(commitBody),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const matchCount = await adminPrisma.footballMatch.count({ where: { tournamentId } });
    expect(matchCount).toBe(3);
  });
});
