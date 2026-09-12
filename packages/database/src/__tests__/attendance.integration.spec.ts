import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for the Phase 19 attendance foundation
 * (Attendance) — the `[eventId, personId]` uniqueness constraint,
 * cross-tenant composite-FK rejection, defaults, and RLS fail-closed/
 * tenant-isolation behavior. Not part of `pnpm test` (needs a real
 * PostgreSQL instance), same reasoning as calendar-events.integration.spec.ts.
 * Run via `pnpm test:integration`.
 */

const rawPrisma = new PrismaClient(); // uses DATABASE_URL — must be the restricted verevia_app role
const adminPrisma = createAdminPrismaForTests();

let tenantAId: string;
let tenantBId: string;
let departmentFootballAId: string;
let teamE1AId: string;
let teamE1BId: string;
let personAId: string;
let personBId: string;
let eventAId: string;

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({
    data: { name: "Attendance Test Tenant A", slug: `attendance-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Attendance Test Tenant B", slug: `attendance-b-${Date.now()}` },
  });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const departmentFootballA = await adminPrisma.department.create({
    data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" },
  });
  departmentFootballAId = departmentFootballA.id;
  const departmentFootballB = await adminPrisma.department.create({
    data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" },
  });

  const teamE1A = await adminPrisma.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "E1" },
  });
  teamE1AId = teamE1A.id;
  const teamE1B = await adminPrisma.team.create({
    data: { tenantId: tenantBId, departmentId: departmentFootballB.id, name: "E1" },
  });
  teamE1BId = teamE1B.id;

  const personA = await adminPrisma.person.create({
    data: { tenantId: tenantAId, firstName: "Test", lastName: "PersonA" },
  });
  personAId = personA.id;
  const personB = await adminPrisma.person.create({
    data: { tenantId: tenantBId, firstName: "Test", lastName: "PersonB" },
  });
  personBId = personB.id;

  const eventA = await adminPrisma.event.create({
    data: { tenantId: tenantAId, teamId: teamE1AId, title: "Training", type: "TRAINING", startsAt: new Date("2026-09-10T17:00:00Z"), endsAt: new Date("2026-09-10T18:30:00Z") },
  });
  eventAId = eventA.id;
});

afterAll(async () => {
  await adminPrisma.attendance.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.event.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("Attendance defaults and uniqueness", () => {
  it("defaults rsvpStatus to PENDING and attended to null", async () => {
    const db = getTenantPrisma(tenantAId);
    const attendance = await db.attendance.create({
      data: { tenantId: tenantAId, eventId: eventAId, personId: personAId },
    });
    expect(attendance.rsvpStatus).toBe("PENDING");
    expect(attendance.attended).toBeNull();
    await adminPrisma.attendance.delete({ where: { id: attendance.id } });
  });

  it("rejects a second Attendance row for the same (eventId, personId) pair", async () => {
    const db = getTenantPrisma(tenantAId);
    const first = await db.attendance.create({
      data: { tenantId: tenantAId, eventId: eventAId, personId: personAId },
    });
    await expect(
      db.attendance.create({ data: { tenantId: tenantAId, eventId: eventAId, personId: personAId } }),
    ).rejects.toThrow();
    await adminPrisma.attendance.delete({ where: { id: first.id } });
  });

  it("allows updating the SAME (eventId, personId) row via upsert (idempotent RSVP resubmission)", async () => {
    const db = getTenantPrisma(tenantAId);
    const created = await db.attendance.upsert({
      where: { eventId_personId: { eventId: eventAId, personId: personAId } },
      update: { rsvpStatus: "ACCEPTED" },
      create: { tenantId: tenantAId, eventId: eventAId, personId: personAId, rsvpStatus: "ACCEPTED" },
    });
    expect(created.rsvpStatus).toBe("ACCEPTED");

    const updated = await db.attendance.upsert({
      where: { eventId_personId: { eventId: eventAId, personId: personAId } },
      update: { rsvpStatus: "DECLINED" },
      create: { tenantId: tenantAId, eventId: eventAId, personId: personAId, rsvpStatus: "DECLINED" },
    });
    expect(updated.id).toBe(created.id);
    expect(updated.rsvpStatus).toBe("DECLINED");

    const count = await adminPrisma.attendance.count({ where: { eventId: eventAId, personId: personAId } });
    expect(count).toBe(1);
    await adminPrisma.attendance.delete({ where: { id: created.id } });
  });
});

describe("Cross-tenant FK consistency — Attendance → Event/Person", () => {
  it("rejects an Attendance whose personId belongs to a different tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.attendance.create({ data: { tenantId: tenantAId, eventId: eventAId, personId: personBId } }),
    ).rejects.toThrow();
  });

  it("rejects an Attendance whose eventId belongs to a different tenant", async () => {
    const eventB = await adminPrisma.event.create({
      data: { tenantId: tenantBId, teamId: teamE1BId, title: "Training B", startsAt: new Date("2026-09-10T17:00:00Z"), endsAt: new Date("2026-09-10T18:00:00Z") },
    });
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.attendance.create({ data: { tenantId: tenantAId, eventId: eventB.id, personId: personAId } }),
    ).rejects.toThrow();
    await adminPrisma.event.delete({ where: { id: eventB.id } });
  });
});

describe("PostgreSQL RLS — fail-closed without tenant context (Attendance)", () => {
  it("a connection with no app.tenant_id set sees NO Attendance rows", async () => {
    const db = getTenantPrisma(tenantAId);
    const attendance = await db.attendance.create({
      data: { tenantId: tenantAId, eventId: eventAId, personId: personAId },
    });

    const rows = await rawPrisma.attendance.findMany({ where: { id: attendance.id } });
    expect(rows).toHaveLength(0);

    await adminPrisma.attendance.delete({ where: { id: attendance.id } });
  });
});

describe("PostgreSQL RLS — tenant isolation (Attendance)", () => {
  it("Tenant B does NOT see Tenant A's Attendance", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const attendance = await dbA.attendance.create({
      data: { tenantId: tenantAId, eventId: eventAId, personId: personAId },
    });

    const dbB = getTenantPrisma(tenantBId);
    const seenByB = await dbB.attendance.findUnique({ where: { id: attendance.id } });
    expect(seenByB).toBeNull();

    await adminPrisma.attendance.delete({ where: { id: attendance.id } });
  });

  it("Tenant B cannot update Tenant A's Attendance", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const attendance = await dbA.attendance.create({
      data: { tenantId: tenantAId, eventId: eventAId, personId: personAId, rsvpStatus: "PENDING" },
    });

    const dbB = getTenantPrisma(tenantBId);
    await expect(
      dbB.attendance.update({ where: { id: attendance.id }, data: { rsvpStatus: "ACCEPTED" } }),
    ).rejects.toThrow();

    const stillOriginal = await dbA.attendance.findUnique({ where: { id: attendance.id } });
    expect(stillOriginal?.rsvpStatus).toBe("PENDING");

    await adminPrisma.attendance.delete({ where: { id: attendance.id } });
  });

  it("Tenant B cannot delete Tenant A's Attendance", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const attendance = await dbA.attendance.create({
      data: { tenantId: tenantAId, eventId: eventAId, personId: personAId },
    });

    const dbB = getTenantPrisma(tenantBId);
    await dbB.attendance.delete({ where: { id: attendance.id } }).catch(() => undefined);

    const stillExists = await dbA.attendance.findUnique({ where: { id: attendance.id } });
    expect(stillExists).not.toBeNull();

    await adminPrisma.attendance.delete({ where: { id: attendance.id } });
  });
});
