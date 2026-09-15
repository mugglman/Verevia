import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for the Phase 20 task foundation (Task) — the
 * team-XOR-person scope CHECK constraint, cross-tenant composite-FK
 * rejection, and RLS fail-closed/tenant-isolation behavior. Not part of
 * `pnpm test` (needs a real PostgreSQL instance), same reasoning as
 * calendar-events.integration.spec.ts. Run via `pnpm test:integration`.
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
let taskAId: string;

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({
    data: { name: "Task Test Tenant A", slug: `task-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Task Test Tenant B", slug: `task-b-${Date.now()}` },
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

  const taskA = await adminPrisma.task.create({
    data: { tenantId: tenantAId, teamId: teamE1AId, title: "Trikots waschen" },
  });
  taskAId = taskA.id;
});

afterAll(async () => {
  await adminPrisma.task.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.person.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("Task assignee CHECK constraint (task_assignee_xor)", () => {
  it("rejects a Task with BOTH teamId and personId set", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.task.create({ data: { tenantId: tenantAId, teamId: teamE1AId, personId: personAId, title: "Invalid" } }),
    ).rejects.toThrow();
  });

  it("rejects a Task with NEITHER teamId nor personId set", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(db.task.create({ data: { tenantId: tenantAId, title: "Invalid" } })).rejects.toThrow();
  });

  it("accepts a team-scoped Task", async () => {
    const db = getTenantPrisma(tenantAId);
    const task = await db.task.create({ data: { tenantId: tenantAId, teamId: teamE1AId, title: "Team Task" } });
    expect(task.teamId).toBe(teamE1AId);
    expect(task.status).toBe("OPEN");
    await adminPrisma.task.delete({ where: { id: task.id } });
  });

  it("accepts a person-scoped Task", async () => {
    const db = getTenantPrisma(tenantAId);
    const task = await db.task.create({ data: { tenantId: tenantAId, personId: personAId, title: "Person Task" } });
    expect(task.personId).toBe(personAId);
    await adminPrisma.task.delete({ where: { id: task.id } });
  });
});

describe("Cross-tenant FK consistency — Task → Team/Person", () => {
  it("rejects a Task whose teamId belongs to a different tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.task.create({ data: { tenantId: tenantAId, teamId: teamE1BId, title: "Cross-Tenant Team" } }),
    ).rejects.toThrow();
  });

  it("rejects a Task whose personId belongs to a different tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.task.create({ data: { tenantId: tenantAId, personId: personBId, title: "Cross-Tenant Person" } }),
    ).rejects.toThrow();
  });
});

describe("Task status transitions", () => {
  it("updates status from OPEN to DONE and back", async () => {
    const db = getTenantPrisma(tenantAId);
    const task = await db.task.create({ data: { tenantId: tenantAId, personId: personAId, title: "Status Task" } });
    const done = await db.task.update({ where: { id: task.id }, data: { status: "DONE" } });
    expect(done.status).toBe("DONE");
    const reopened = await db.task.update({ where: { id: task.id }, data: { status: "OPEN" } });
    expect(reopened.status).toBe("OPEN");
    await adminPrisma.task.delete({ where: { id: task.id } });
  });
});

describe("PostgreSQL RLS — fail-closed without tenant context (Task)", () => {
  it("a connection with no app.tenant_id set sees NO Task rows", async () => {
    const tasks = await rawPrisma.task.findMany({ where: { id: taskAId } });
    expect(tasks).toHaveLength(0);
  });
});

describe("PostgreSQL RLS — tenant isolation (Task)", () => {
  it("Tenant B does NOT see Tenant A's Task", async () => {
    const db = getTenantPrisma(tenantBId);
    const task = await db.task.findUnique({ where: { id: taskAId } });
    expect(task).toBeNull();
  });

  it("Tenant B cannot update Tenant A's Task", async () => {
    const db = getTenantPrisma(tenantBId);
    await expect(db.task.update({ where: { id: taskAId }, data: { title: "Hijacked" } })).rejects.toThrow();

    const dbA = getTenantPrisma(tenantAId);
    const stillOriginal = await dbA.task.findUnique({ where: { id: taskAId } });
    expect(stillOriginal?.title).toBe("Trikots waschen");
  });

  it("Tenant B cannot delete Tenant A's Task", async () => {
    const db = getTenantPrisma(tenantBId);
    await db.task.delete({ where: { id: taskAId } }).catch(() => undefined);

    const dbA = getTenantPrisma(tenantAId);
    const stillExists = await dbA.task.findUnique({ where: { id: taskAId } });
    expect(stillExists).not.toBeNull();
  });
});
