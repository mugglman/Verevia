import { prisma, getTenantPrisma } from "../src/index";

/**
 * Minimal development seed, per the Phase 2 work order section 23, extended
 * in Phase 3 (section 29) with two demo teams ("E1"/"E2") under Fußball,
 * in Phase 4 (section 25) with a TeamMember assignment for each demo
 * person — fachliche Mannschaftszugehörigkeit, siehe schema.prisma-
 * Kommentar am Modell `TeamMember` (bewusst getrennt von `Membership`/
 * `RoleAssignment`) — and in Phase 5 (section 29) with a demo role
 * constellation: Max Mustermann is additionally COACH of E1 (a coach who's
 * also an E1 TeamMember — an ordinary real-club combination), and a third
 * fictional person, Petra Beispiel, is TENANT_ADMIN (Vereinsadministrator)
 * with no team assignment.
 *
 * Deliberately contains NO real personal data — the demo persons use
 * obviously fictional, clearly-placeholder German names ("Max Mustermann" /
 * "Erika Musterfrau" / "Petra Beispiel" — "Beispiel" literally means
 * "example"), not any real club member or anyone connected to this
 * project. Team names ("E1"/"E2") are generic youth-team labels, not tied
 * to any real roster.
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

  // Phase 5, section 29: a clear demo constellation for role management —
  // Person A (Vereinsadministrator, TENANT scope, no team assignment) and
  // Person B (Trainer, TEAM scope — reuses Max Mustermann, who is already
  // an E1 TeamMember from the loop above: a coach who's also listed on the
  // roster is a perfectly ordinary real-club combination, not a modelling
  // shortcut). Idempotent: checked before creating, like everything above.
  const maxMustermann = await db.person.findFirstOrThrow({
    where: { tenantId: tenant.id, firstName: "Max", lastName: "Mustermann" },
  });
  const e1 = teamsByName.get("E1")!;
  const existingCoachRole = await db.roleAssignment.findFirst({
    where: { tenantId: tenant.id, personId: maxMustermann.id, role: "COACH", scopeType: "TEAM", teamId: e1.id },
  });
  if (!existingCoachRole) {
    await db.roleAssignment.create({
      data: { tenantId: tenant.id, personId: maxMustermann.id, role: "COACH", scopeType: "TEAM", teamId: e1.id },
    });
  }

  let vereinsadmin = await db.person.findFirst({
    where: { tenantId: tenant.id, firstName: "Petra", lastName: "Beispiel" },
  });
  if (!vereinsadmin) {
    vereinsadmin = await db.person.create({
      data: { tenantId: tenant.id, firstName: "Petra", lastName: "Beispiel" },
    });
  }
  const existingAdminRole = await db.roleAssignment.findFirst({
    where: { tenantId: tenant.id, personId: vereinsadmin.id, role: "TENANT_ADMIN", scopeType: "TENANT" },
  });
  if (!existingAdminRole) {
    await db.roleAssignment.create({
      data: { tenantId: tenant.id, personId: vereinsadmin.id, role: "TENANT_ADMIN", scopeType: "TENANT" },
    });
  }

  console.log(`Seeded tenant "${tenant.name}" (${tenant.id})`);
  console.log(`Seeded department "${department.name}" (${department.id})`);
  console.log(`Seeded ${demoTeamNames.length} teams: ${demoTeamNames.join(", ")}`);
  console.log(
    `Seeded ${demoPersons.length} fictional demo persons, each assigned to a team.`,
  );
  console.log(`Seeded role assignments: Max Mustermann as Trainer (E1), Petra Beispiel as Vereinsadministrator.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
