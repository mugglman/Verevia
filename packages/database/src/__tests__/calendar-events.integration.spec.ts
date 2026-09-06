import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for the Phase 18 calendar/event foundation
 * (Event) — the team-XOR-department scope CHECK constraint, the date-range
 * CHECK constraint, cross-tenant composite-FK rejection, and RLS
 * fail-closed/tenant-isolation behavior. Not part of `pnpm test` (needs a
 * real PostgreSQL instance), same reasoning as
 * football-season.integration.spec.ts. Run via `pnpm test:integration`.
 */

const rawPrisma = new PrismaClient(); // uses DATABASE_URL — must be the restricted verevia_app role
const adminPrisma = createAdminPrismaForTests();

let tenantAId: string;
let tenantBId: string;
let departmentFootballAId: string;
let departmentFootballBId: string;
let teamE1AId: string;
let teamE1BId: string;
let seasonAId: string;
let venueAId: string;
let eventAId: string;

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({
    data: { name: "Calendar Events Test Tenant A", slug: `calendar-events-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Calendar Events Test Tenant B", slug: `calendar-events-b-${Date.now()}` },
  });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const departmentFootballA = await adminPrisma.department.create({
    data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" },
  });
  const departmentFootballB = await adminPrisma.department.create({
    data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" },
  });
  departmentFootballAId = departmentFootballA.id;
  departmentFootballBId = departmentFootballB.id;

  const teamE1A = await adminPrisma.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "E1" },
  });
  const teamE1B = await adminPrisma.team.create({
    data: { tenantId: tenantBId, departmentId: departmentFootballBId, name: "E1" },
  });
  teamE1AId = teamE1A.id;
  teamE1BId = teamE1B.id;

  const seasonA = await adminPrisma.season.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "2026/2027", startsAt: new Date("2026-08-01"), endsAt: new Date("2027-06-30"), status: "ACTIVE" },
  });
  seasonAId = seasonA.id;

  const venueA = await adminPrisma.venue.create({ data: { tenantId: tenantAId, name: "Sportplatz Test" } });
  venueAId = venueA.id;

  const eventA = await adminPrisma.event.create({
    data: { tenantId: tenantAId, teamId: teamE1AId, title: "Training", type: "TRAINING", startsAt: new Date("2026-09-10T17:00:00Z"), endsAt: new Date("2026-09-10T18:30:00Z") },
  });
  eventAId = eventA.id;
});

afterAll(async () => {
  await adminPrisma.event.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.venue.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.season.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("Event scope CHECK constraint (event_scope_xor)", () => {
  it("rejects an Event with BOTH teamId and departmentId set", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.event.create({
        data: { tenantId: tenantAId, teamId: teamE1AId, departmentId: departmentFootballAId, title: "Invalid", startsAt: new Date("2026-09-11T17:00:00Z"), endsAt: new Date("2026-09-11T18:00:00Z") },
      }),
    ).rejects.toThrow();
  });

  it("rejects an Event with NEITHER teamId nor departmentId set", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.event.create({
        data: { tenantId: tenantAId, title: "Invalid", startsAt: new Date("2026-09-11T17:00:00Z"), endsAt: new Date("2026-09-11T18:00:00Z") },
      }),
    ).rejects.toThrow();
  });

  it("accepts a team-scoped Event", async () => {
    const db = getTenantPrisma(tenantAId);
    const event = await db.event.create({
      data: { tenantId: tenantAId, teamId: teamE1AId, title: "Team Event", startsAt: new Date("2026-09-12T17:00:00Z"), endsAt: new Date("2026-09-12T18:00:00Z") },
    });
    expect(event.teamId).toBe(teamE1AId);
    await adminPrisma.event.delete({ where: { id: event.id } });
  });

  it("accepts a department-scoped Event", async () => {
    const db = getTenantPrisma(tenantAId);
    const event = await db.event.create({
      data: { tenantId: tenantAId, departmentId: departmentFootballAId, title: "Department Event", startsAt: new Date("2026-09-12T17:00:00Z"), endsAt: new Date("2026-09-12T18:00:00Z") },
    });
    expect(event.departmentId).toBe(departmentFootballAId);
    await adminPrisma.event.delete({ where: { id: event.id } });
  });
});

describe("Event date-range CHECK constraint", () => {
  it("rejects an Event where endsAt is before startsAt", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.event.create({
        data: { tenantId: tenantAId, teamId: teamE1AId, title: "Invalid Range", startsAt: new Date("2026-09-11T18:00:00Z"), endsAt: new Date("2026-09-11T17:00:00Z") },
      }),
    ).rejects.toThrow();
  });

  it("accepts an Event where startsAt equals endsAt", async () => {
    const db = getTenantPrisma(tenantAId);
    const event = await db.event.create({
      data: { tenantId: tenantAId, teamId: teamE1AId, title: "Zero Duration", startsAt: new Date("2026-09-11T17:00:00Z"), endsAt: new Date("2026-09-11T17:00:00Z") },
    });
    expect(event.startsAt).toEqual(event.endsAt);
    await adminPrisma.event.delete({ where: { id: event.id } });
  });
});

describe("Cross-tenant FK consistency — Event → Team/Department/Season/Venue", () => {
  it("rejects an Event whose teamId belongs to a different tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.event.create({
        data: { tenantId: tenantAId, teamId: teamE1BId, title: "Cross-Tenant Team", startsAt: new Date("2026-09-11T17:00:00Z"), endsAt: new Date("2026-09-11T18:00:00Z") },
      }),
    ).rejects.toThrow();
  });

  it("rejects an Event whose departmentId belongs to a different tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.event.create({
        data: { tenantId: tenantAId, departmentId: departmentFootballBId, title: "Cross-Tenant Department", startsAt: new Date("2026-09-11T17:00:00Z"), endsAt: new Date("2026-09-11T18:00:00Z") },
      }),
    ).rejects.toThrow();
  });

  it("accepts an Event whose team, season, and venue all belong to the SAME tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    const event = await db.event.create({
      data: { tenantId: tenantAId, teamId: teamE1AId, seasonId: seasonAId, venueId: venueAId, title: "Fully Scoped", startsAt: new Date("2026-09-13T17:00:00Z"), endsAt: new Date("2026-09-13T18:00:00Z") },
    });
    expect(event.seasonId).toBe(seasonAId);
    expect(event.venueId).toBe(venueAId);
    await adminPrisma.event.delete({ where: { id: event.id } });
  });
});

describe("PostgreSQL RLS — fail-closed without tenant context (Event)", () => {
  it("a connection with no app.tenant_id set sees NO Event rows", async () => {
    const events = await rawPrisma.event.findMany({ where: { id: eventAId } });
    expect(events).toHaveLength(0);
  });
});

describe("PostgreSQL RLS — tenant isolation (Event)", () => {
  it("Tenant B does NOT see Tenant A's Event", async () => {
    const db = getTenantPrisma(tenantBId);
    const event = await db.event.findUnique({ where: { id: eventAId } });
    expect(event).toBeNull();
  });

  it("Tenant B cannot update Tenant A's Event", async () => {
    const db = getTenantPrisma(tenantBId);
    await expect(db.event.update({ where: { id: eventAId }, data: { title: "Hijacked" } })).rejects.toThrow();

    const dbA = getTenantPrisma(tenantAId);
    const stillOriginal = await dbA.event.findUnique({ where: { id: eventAId } });
    expect(stillOriginal?.title).toBe("Training");
  });

  it("Tenant B cannot delete Tenant A's Event", async () => {
    const db = getTenantPrisma(tenantBId);
    await db.event.delete({ where: { id: eventAId } }).catch(() => undefined);

    const dbA = getTenantPrisma(tenantAId);
    const stillExists = await dbA.event.findUnique({ where: { id: eventAId } });
    expect(stillExists).not.toBeNull();
  });
});
