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
 * End-to-end verification of Phase 17's public, unauthenticated tournament
 * page endpoint (`GET /public/tournaments/:id`) against a real PostgreSQL
 * instance and real better-auth sessions — the CALLS UNDER TEST themselves
 * use NO cookie/session at all (that is the entire point of this
 * endpoint); an authenticated TENANT_ADMIN session is only used to build
 * the tournament fixture beforehand via the existing, already-tested
 * management endpoints. Not part of `pnpm test`/CI (no DB there). Run via
 * `pnpm test:integration`.
 */

const adminPrisma = createAdminPrismaForTests();
let app: INestApplication;
let server: import("http").Server;

let tenantAId: string;
let tenantBId: string;
let departmentFootballId: string;
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

function getPublic(tenantId: string, tournamentId: string) {
  // Deliberately NO Cookie header — the whole point of this endpoint.
  return request(server).get(`/api/v1/public/tournaments/${tournamentId}`).set("X-Tenant-Id", tenantId);
}

async function patchMatch(cookie: string, tenantId: string, matchId: string, body: Record<string, unknown>) {
  return request(server).patch(`/api/v1/football/matches/${matchId}`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send(body);
}

/**
 * Builds a real tournament (mode GROUPS) with one group of 3 participants
 * and their 3 round-robin matches — none finalized yet. Defaults to
 * "PLANNED" (not the DTO's own DRAFT default) since most tests here need
 * a publicly-visible tournament; pass an explicit status to override.
 */
async function createTournamentWithGroup(cookie: string, tenantId: string, status: string = "PLANNED") {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tournamentResponse = await request(server)
    .post("/api/v1/football/tournaments")
    .set("Cookie", cookie)
    .set("X-Tenant-Id", tenantId)
    .send({
      departmentId: departmentFootballId,
      name: `Public Page Cup ${suffix}`,
      mode: "GROUPS",
      status,
      startsAt: "2026-12-05T09:00:00.000Z",
      endsAt: "2026-12-05T22:00:00.000Z",
      description: "Ein fiktives Turnier für den Public-Page-Test",
    });
  const tournamentId = tournamentResponse.body.id as string;
  cleanupTournamentIds.push(tournamentId);

  const groupResponse = await request(server).post(`/api/v1/football/tournaments/${tournamentId}/groups`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send({ name: "Gruppe A" });
  const groupId = groupResponse.body.id as string;

  const participantIds: string[] = [];
  const participantNames = [`Team Eins ${suffix}`, `Team Zwei ${suffix}`, `Team Drei ${suffix}`];
  for (const name of participantNames) {
    const participantResponse = await request(server)
      .post(`/api/v1/football/tournaments/${tournamentId}/participants`)
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId)
      .send({ externalName: name });
    const participantId = participantResponse.body.id as string;
    participantIds.push(participantId);
    await request(server).patch(`/api/v1/football/tournaments/${tournamentId}/participants/${participantId}`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send({ groupId });
  }
  await request(server).post(`/api/v1/football/tournaments/${tournamentId}/venues`).set("Cookie", cookie).set("X-Tenant-Id", tenantId).send({ venueId });

  const matchIds: string[] = [];
  let offset = 0;
  for (let i = 0; i < participantIds.length; i++) {
    for (let j = i + 1; j < participantIds.length; j++) {
      const startsAt = new Date(Date.parse("2026-12-05T09:00:00.000Z") + offset * 60_000).toISOString();
      offset += 20;
      const matchResponse = await request(server)
        .post(`/api/v1/football/tournaments/${tournamentId}/matches`)
        .set("Cookie", cookie)
        .set("X-Tenant-Id", tenantId)
        .send({ venueId, tournamentGroupId: groupId, homeParticipantId: participantIds[i], awayParticipantId: participantIds[j], startsAt, type: "TOURNAMENT", homeAway: "HOME" });
      matchIds.push(matchResponse.body.id as string);
    }
  }

  return { tournamentId, groupId, participantIds, participantNames, matchIds };
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

  const tenantA = await adminPrisma.tenant.create({ data: { name: "Public Page API Test Tenant A", slug: `public-page-api-a-${Date.now()}` } });
  const tenantB = await adminPrisma.tenant.create({ data: { name: "Public Page API Test Tenant B", slug: `public-page-api-b-${Date.now()}` } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const dbA = getTenantPrisma(tenantAId);
  const football = await dbA.department.create({ data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" } });
  departmentFootballId = football.id;

  const venue = await dbA.venue.create({ data: { tenantId: tenantAId, name: "Sportplatz Test" } });
  venueId = venue.id;

  const dbB = getTenantPrisma(tenantBId);
  await dbB.department.create({ data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" } });
});

afterAll(async () => {
  await adminPrisma.tournamentMatchSlot.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentParticipant.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentVenue.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballTournament.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.venue.deleteMany({ where: { tenantId: tenantAId } });
  await adminPrisma.roleAssignment.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.membership.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.session.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.account.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await adminPrisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await app.close();
});

describe("Public tournament page — GET /public/tournaments/:id", () => {
  it("requires no session at all and returns the tournament with participants, groups, and matches", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-public-basic", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantNames, matchIds } = await createTournamentWithGroup(admin.cookie, tenantAId);

    const response = await getPublic(tenantAId, tournamentId);
    expect(response.status).toBe(200);
    expect(response.body.name).toContain("Public Page Cup");
    expect(response.body.description).toBe("Ein fiktives Turnier für den Public-Page-Test");
    expect(response.body.departmentName).toBe("Fußball");
    expect(response.body.participants).toHaveLength(3);
    expect(response.body.participants.map((p: { label: string }) => p.label).sort()).toEqual([...participantNames].sort());
    expect(response.body.groups).toHaveLength(1);
    expect(response.body.matches).toHaveLength(3);
    expect(response.body.matches.every((m: { id: string }) => matchIds.includes(m.id))).toBe(true);
    // No management fields leak into the public projection.
    expect(response.body).not.toHaveProperty("canEdit");
    expect(response.body.participants[0]).not.toHaveProperty("canEdit");
  });

  it("shows an interim standings table (not complete) with only some group results entered", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-public-interim", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, matchIds } = await createTournamentWithGroup(admin.cookie, tenantAId);

    await patchMatch(admin.cookie, tenantAId, matchIds[0]!, { status: "COMPLETED", homeScore: 2, awayScore: 0 });

    const response = await getPublic(tenantAId, tournamentId);
    expect(response.status).toBe(200);
    const group = response.body.groups[0];
    expect(group.isComplete).toBe(false);
    expect(group.standings).toHaveLength(3);
    expect(group.standings.some((row: { played: number }) => row.played > 0)).toBe(true);
  });

  it("shows the final standings table (isComplete) once every group match is finished, including a draw", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-public-final", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, matchIds } = await createTournamentWithGroup(admin.cookie, tenantAId);

    await patchMatch(admin.cookie, tenantAId, matchIds[0]!, { status: "COMPLETED", homeScore: 2, awayScore: 0 });
    await patchMatch(admin.cookie, tenantAId, matchIds[1]!, { status: "COMPLETED", homeScore: 3, awayScore: 0 });
    await patchMatch(admin.cookie, tenantAId, matchIds[2]!, { status: "COMPLETED", homeScore: 1, awayScore: 1 });

    const response = await getPublic(tenantAId, tournamentId);
    const group = response.body.groups[0];
    expect(group.isComplete).toBe(true);
    expect(group.standings.every((row: { played: number }) => row.played === 2)).toBe(true);
    const drawMatch = response.body.matches.find((m: { id: string }) => m.id === matchIds[2]);
    expect(drawMatch.homeScore).toBe(1);
    expect(drawMatch.awayScore).toBe(1);
  });

  it("is idempotent — repeated reads return identical data and never mutate state", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-public-idempotent", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, matchIds } = await createTournamentWithGroup(admin.cookie, tenantAId);
    await patchMatch(admin.cookie, tenantAId, matchIds[0]!, { status: "COMPLETED", homeScore: 1, awayScore: 0 });

    const first = await getPublic(tenantAId, tournamentId);
    const second = await getPublic(tenantAId, tournamentId);
    expect(first.body).toEqual(second.body);
  });

  it("returns 404 for a DRAFT tournament — not yet meant to be public", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-public-draft", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId } = await createTournamentWithGroup(admin.cookie, tenantAId, "DRAFT");

    const response = await getPublic(tenantAId, tournamentId);
    expect(response.status).toBe(404);
  });

  it("returns 200 for a CANCELLED tournament — visitors should still see that it was cancelled", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-public-cancelled", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId } = await createTournamentWithGroup(admin.cookie, tenantAId, "CANCELLED");

    const response = await getPublic(tenantAId, tournamentId);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("CANCELLED");
  });

  it("returns 404 for a non-existent tournament id", async () => {
    const response = await getPublic(tenantAId, "00000000-0000-0000-0000-000000000000");
    expect(response.status).toBe(404);
  });

  it("returns 400 when the X-Tenant-Id header is missing", async () => {
    const response = await request(server).get(`/api/v1/public/tournaments/00000000-0000-0000-0000-000000000000`);
    expect(response.status).toBe(400);
  });

  it("cross-tenant: tenant B cannot read tenant A's tournament via the public endpoint (RLS)", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-public-cross-tenant", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId } = await createTournamentWithGroup(admin.cookie, tenantAId);

    const response = await getPublic(tenantBId, tournamentId);
    expect(response.status).toBe(404);
  });

  it("marks a withdrawn participant so the public page can show it, without hiding it entirely", async () => {
    const admin = await createAuthenticatedMember(tenantAId, "admin-public-withdrawn", [{ role: "TENANT_ADMIN", scopeType: "TENANT" }]);
    const { tournamentId, participantIds } = await createTournamentWithGroup(admin.cookie, tenantAId);

    await request(server)
      .patch(`/api/v1/football/tournaments/${tournamentId}/participants/${participantIds[0]}`)
      .set("Cookie", admin.cookie)
      .set("X-Tenant-Id", tenantAId)
      .send({ status: "WITHDRAWN" });

    const response = await getPublic(tenantAId, tournamentId);
    const withdrawn = response.body.participants.find((p: { id: string }) => p.id === participantIds[0]);
    expect(withdrawn.status).toBe("WITHDRAWN");
  });
});
