import { prisma, getTenantPrisma } from "../src/index";

/**
 * Minimal development seed, per the Phase 2 work order section 23, extended
 * in Phase 3 (section 29) with two demo teams ("E1"/"E2") under Fußball.
 *
 * Deliberately contains NO real personal data — the two demo persons use
 * obviously fictional, universally recognized German placeholder names
 * ("Max Mustermann" / "Erika Musterfrau"), not any real club member or
 * anyone connected to this project. Team names ("E1"/"E2") are generic
 * youth-team labels, not tied to any real roster.
 *
 * Tenant creation uses the plain, non-tenant-scoped `prisma` client (Tenant
 * itself carries no RLS policy, see schema.prisma). Everything below it
 * uses `getTenantPrisma(tenant.id)` — the same code path a real
 * tenant-onboarding flow would use — rather than an admin/superuser
 * bypass, so this script doubles as a small end-to-end proof that seeding
 * works through the normal RLS-protected path.
 */
async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "tsv-benediktbeuern" },
    update: {},
    create: { name: "TSV Benediktbeuern", slug: "tsv-benediktbeuern" },
  });

  const db = getTenantPrisma(tenant.id);

  const department = await db.department.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Fußball" } },
    update: {},
    create: { tenantId: tenant.id, name: "Fußball" },
  });

  const demoTeamNames = ["E1", "E2"];
  for (const teamName of demoTeamNames) {
    await db.team.upsert({
      where: { departmentId_name: { departmentId: department.id, name: teamName } },
      update: {},
      create: { tenantId: tenant.id, departmentId: department.id, name: teamName },
    });
  }

  const demoPersons = [
    { firstName: "Max", lastName: "Mustermann" },
    { firstName: "Erika", lastName: "Musterfrau" },
  ];

  for (const demo of demoPersons) {
    const existing = await db.person.findFirst({
      where: { tenantId: tenant.id, firstName: demo.firstName, lastName: demo.lastName },
    });
    if (!existing) {
      await db.person.create({ data: { tenantId: tenant.id, ...demo } });
    }
  }

  console.log(`Seeded tenant "${tenant.name}" (${tenant.id})`);
  console.log(`Seeded department "${department.name}" (${department.id})`);
  console.log(`Seeded ${demoTeamNames.length} teams: ${demoTeamNames.join(", ")}`);
  console.log(`Seeded ${demoPersons.length} fictional demo persons.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
