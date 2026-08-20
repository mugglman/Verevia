import { prisma, getTenantPrisma } from "../src/index";

/**
 * Minimal development seed, per the Phase 2 work order section 23, extended
 * in Phase 3 (section 29) with two demo teams ("E1"/"E2") under Fußball,
 * and in Phase 4 (section 25) with a TeamMember assignment for each demo
 * person — fachliche Mannschaftszugehörigkeit, siehe schema.prisma-
 * Kommentar am Modell `TeamMember` (bewusst getrennt von `Membership`/
 * `RoleAssignment`).
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
  const teamsByName = new Map<string, { id: string }>();
  for (const teamName of demoTeamNames) {
    const team = await db.team.upsert({
      where: { departmentId_name: { departmentId: department.id, name: teamName } },
      update: {},
      create: { tenantId: tenant.id, departmentId: department.id, name: teamName },
    });
    teamsByName.set(teamName, team);
  }

  const demoPersons = [
    { firstName: "Max", lastName: "Mustermann", teamName: "E1" },
    { firstName: "Erika", lastName: "Musterfrau", teamName: "E2" },
  ];

  for (const demo of demoPersons) {
    let person = await db.person.findFirst({
      where: { tenantId: tenant.id, firstName: demo.firstName, lastName: demo.lastName },
    });
    if (!person) {
      person = await db.person.create({
        data: { tenantId: tenant.id, firstName: demo.firstName, lastName: demo.lastName },
      });
    }

    const team = teamsByName.get(demo.teamName)!;
    const existingMembership = await db.teamMember.findFirst({
      where: { tenantId: tenant.id, personId: person.id, teamId: team.id },
    });
    if (!existingMembership) {
      await db.teamMember.create({
        data: { tenantId: tenant.id, personId: person.id, teamId: team.id },
      });
    } else if (existingMembership.status !== "ACTIVE") {
      await db.teamMember.update({
        where: { id: existingMembership.id },
        data: { status: "ACTIVE" },
      });
    }
  }

  console.log(`Seeded tenant "${tenant.name}" (${tenant.id})`);
  console.log(`Seeded department "${department.name}" (${department.id})`);
  console.log(`Seeded ${demoTeamNames.length} teams: ${demoTeamNames.join(", ")}`);
  console.log(
    `Seeded ${demoPersons.length} fictional demo persons, each assigned to a team.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
