import { prisma, getTenantPrisma } from "../src/index";

/**
 * Minimal development seed, per the Phase 2 work order section 23, extended
 * in Phase 3 (section 29) with two demo teams ("E1"/"E2") under Fußball,
 * in Phase 4 (section 25) with a TeamMember assignment for each demo
 * person — fachliche Mannschaftszugehörigkeit, siehe schema.prisma-
 * Kommentar am Modell `TeamMember` (bewusst getrennt von `Membership`/
 * `RoleAssignment`) — in Phase 5 (section 29) with a demo role
 * constellation: Max Mustermann is additionally COACH of E1 (a coach who's
 * also an E1 TeamMember — an ordinary real-club combination), and a third
 * fictional person, Petra Beispiel, is TENANT_ADMIN (Vereinsadministrator)
 * with no team assignment — and in Phase 6 (section 30) with a fourth
 * fictional person, Anna Mustermann, administratively verified as
 * LEGAL_GUARDIAN of Max Mustermann (demonstrates the guardian ReBAC path),
 * and in Phase 9 (section 19) with the football season foundation: the
 * Fußball department is marked `sportType: "FOOTBALL"`, an ACTIVE Season
 * "2026/2027", an AgeGroup "E-Jugend", and TeamSeason assignments linking
 * E1/E2 to that season and age group, and in Phase 10 (section 35/36) with
 * a demo Venue ("Sportplatz Benediktbeuern", no real address) and three
 * fictional demo matches (two upcoming friendlies, one completed league
 * match with a result).
 *
 * Deliberately contains NO real personal data — the demo persons use
 * obviously fictional, clearly-placeholder German names ("Max Mustermann" /
 * "Erika Musterfrau" / "Petra Beispiel" / "Anna Mustermann" — "Beispiel"
 * literally means "example"), not any real club member or anyone connected
 * to this project. Team names ("E1"/"E2") are generic youth-team labels,
 * not tied to any real roster.
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
    update: { sportType: "FOOTBALL" },
    create: { tenantId: tenant.id, name: "Fußball", sportType: "FOOTBALL" },
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

  // Phase 9, section 19: football season foundation — an ACTIVE Season
  // "2026/2027" for the Fußball department, an AgeGroup "E-Jugend", and
  // TeamSeason assignments for both demo teams (E1/E2). Idempotent, like
  // everything above.
  const season = await db.season.upsert({
    where: { departmentId_name: { departmentId: department.id, name: "2026/2027" } },
    update: {},
    create: {
      tenantId: tenant.id,
      departmentId: department.id,
      name: "2026/2027",
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2027-06-30"),
      status: "ACTIVE",
    },
  });

  const ageGroup = await db.ageGroup.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "E-Jugend" } },
    update: {},
    create: { tenantId: tenant.id, name: "E-Jugend", sortOrder: 1 },
  });

  const teamSeasonsByTeamName = new Map<string, { id: string }>();
  for (const teamName of demoTeamNames) {
    const team = teamsByName.get(teamName)!;
    let teamSeason = await db.teamSeason.findFirst({
      where: { tenantId: tenant.id, teamId: team.id, seasonId: season.id },
    });
    if (!teamSeason) {
      teamSeason = await db.teamSeason.create({
        data: {
          tenantId: tenant.id,
          teamId: team.id,
          seasonId: season.id,
          ageGroupId: ageGroup.id,
        },
      });
    }
    teamSeasonsByTeamName.set(teamName, teamSeason);
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

  // Phase 6, section 30: a clear demo constellation for the guardian
  // relationship / ReBAC feature — Anna Mustermann (new, fictional,
  // shares Max's surname as a plausible parent/child pair) is
  // administratively verified as LEGAL_GUARDIAN of Max Mustermann. Max
  // already being COACH of E1 (see above) doesn't conflict with this —
  // a teenage assistant coach with a legal guardian is not an unusual
  // real-club combination. No login/User/Membership is seeded for Anna
  // here (consistent with this file's existing scope — every other demo
  // person is data-only too); a real account is created through the
  // actual invitation flow (API/E2E fixtures), not baked into the seed.
  let annaMustermann = await db.person.findFirst({
    where: { tenantId: tenant.id, firstName: "Anna", lastName: "Mustermann" },
  });
  if (!annaMustermann) {
    annaMustermann = await db.person.create({
      data: { tenantId: tenant.id, firstName: "Anna", lastName: "Mustermann" },
    });
  }
  const existingGuardianRelationship = await db.personRelationship.findFirst({
    where: {
      tenantId: tenant.id,
      fromPersonId: annaMustermann.id,
      toPersonId: maxMustermann.id,
      type: "LEGAL_GUARDIAN",
    },
  });
  if (!existingGuardianRelationship) {
    await db.personRelationship.create({
      data: {
        tenantId: tenant.id,
        fromPersonId: annaMustermann.id,
        toPersonId: maxMustermann.id,
        type: "LEGAL_GUARDIAN",
        status: "VERIFIED",
        isLegalGuardian: true,
      },
    });
  }

  // Phase 10, section 35/36: a demo Venue and demo FootballMatches — purely
  // fictional (no real address, generic fictional opponent names). Two
  // upcoming friendlies (E1 home, E2 away) plus one already COMPLETED
  // league match with a result, to exercise the result-display path too.
  // Idempotent via findFirst-before-create, like the rest of this file.
  const venue = await db.venue.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Sportplatz Benediktbeuern" } },
    update: {},
    create: { tenantId: tenant.id, name: "Sportplatz Benediktbeuern" },
  });

  const demoMatches = [
    {
      teamName: "E1",
      opponentName: "SV Beispielhausen",
      startsAt: new Date("2026-09-12T08:00:00.000Z"), // 10:00 Europe/Berlin (CEST)
      type: "FRIENDLY" as const,
      homeAway: "HOME" as const,
      status: "SCHEDULED" as const,
      venueId: venue.id,
    },
    {
      teamName: "E2",
      opponentName: "FC Musterdorf",
      startsAt: new Date("2026-09-13T09:00:00.000Z"), // 11:00 Europe/Berlin (CEST)
      type: "FRIENDLY" as const,
      homeAway: "AWAY" as const,
      status: "SCHEDULED" as const,
      venueId: null,
    },
    {
      teamName: "E1",
      opponentName: "TSV Nachbarort",
      startsAt: new Date("2026-08-15T14:00:00.000Z"), // 16:00 Europe/Berlin (CEST)
      type: "LEAGUE" as const,
      homeAway: "HOME" as const,
      status: "COMPLETED" as const,
      venueId: venue.id,
      homeScore: 3,
      awayScore: 1,
    },
  ];

  for (const demoMatch of demoMatches) {
    const teamSeason = teamSeasonsByTeamName.get(demoMatch.teamName)!;
    const existingMatch = await db.footballMatch.findFirst({
      where: {
        tenantId: tenant.id,
        teamSeasonId: teamSeason.id,
        opponentName: demoMatch.opponentName,
        startsAt: demoMatch.startsAt,
      },
    });
    if (!existingMatch) {
      await db.footballMatch.create({
        data: {
          tenantId: tenant.id,
          teamSeasonId: teamSeason.id,
          venueId: demoMatch.venueId,
          startsAt: demoMatch.startsAt,
          type: demoMatch.type,
          status: demoMatch.status,
          homeAway: demoMatch.homeAway,
          opponentName: demoMatch.opponentName,
          homeScore: "homeScore" in demoMatch ? demoMatch.homeScore : undefined,
          awayScore: "awayScore" in demoMatch ? demoMatch.awayScore : undefined,
        },
      });
    }
  }

  console.log(`Seeded tenant "${tenant.name}" (${tenant.id})`);
  console.log(`Seeded department "${department.name}" (${department.id})`);
  console.log(`Seeded ${demoTeamNames.length} teams: ${demoTeamNames.join(", ")}`);
  console.log(
    `Seeded ${demoPersons.length} fictional demo persons, each assigned to a team.`,
  );
  console.log(
    `Seeded role assignments: Max Mustermann as Trainer (E1), Petra Beispiel as Vereinsadministrator.`,
  );
  console.log(`Seeded relationship: Anna Mustermann as Erziehungsberechtigte of Max Mustermann.`);
  console.log(`Seeded season "${season.name}" (${season.status}) and age group "${ageGroup.name}".`);
  console.log(`Seeded team season assignments for: ${demoTeamNames.join(", ")}`);
  console.log(`Seeded venue "${venue.name}" (${venue.id})`);
  console.log(`Seeded ${demoMatches.length} demo matches for: ${demoTeamNames.join(", ")}`);

  // Phase 11: tournament core demo structure — "Verevia Jugendcup 2026", a
  // GROUPS-mode tournament bound to the same demo season, with one internal
  // participant (E1) and three purely fictional external participants, two
  // groups (enough participants to show grouping actually doing something),
  // the existing demo venue assigned to the tournament, and one manually
  // created TOURNAMENT-type FootballMatch. No automatic schedule/bracket
  // generation — that's Phase 12. Idempotent via findFirst-before-create,
  // like the rest of this file (FootballTournament has no natural unique
  // key to upsert on).
  let tournament = await db.footballTournament.findFirst({
    where: { tenantId: tenant.id, departmentId: department.id, name: "Verevia Jugendcup 2026" },
  });
  if (!tournament) {
    tournament = await db.footballTournament.create({
      data: {
        tenantId: tenant.id,
        departmentId: department.id,
        seasonId: season.id,
        name: "Verevia Jugendcup 2026",
        description: "Fiktives Jugendturnier zur Demonstration des Turnier-Grundmodells.",
        startsAt: new Date("2026-10-03T07:00:00.000Z"), // 09:00 Europe/Berlin (CET)
        endsAt: new Date("2026-10-03T16:00:00.000Z"), // 18:00 Europe/Berlin (CET)
        status: "PLANNED",
        mode: "GROUPS",
      },
    });
  }

  const e1TeamSeason = teamSeasonsByTeamName.get("E1")!;

  async function ensureInternalParticipant(teamSeasonId: string) {
    let participant = await db.tournamentParticipant.findFirst({
      where: { tenantId: tenant.id, tournamentId: tournament!.id, teamSeasonId },
    });
    if (!participant) {
      participant = await db.tournamentParticipant.create({
        data: { tenantId: tenant.id, tournamentId: tournament!.id, teamSeasonId },
      });
    }
    return participant;
  }

  async function ensureExternalParticipant(externalName: string) {
    let participant = await db.tournamentParticipant.findFirst({
      where: { tenantId: tenant.id, tournamentId: tournament!.id, externalName },
    });
    if (!participant) {
      participant = await db.tournamentParticipant.create({
        data: { tenantId: tenant.id, tournamentId: tournament!.id, externalName },
      });
    }
    return participant;
  }

  const participantE1 = await ensureInternalParticipant(e1TeamSeason.id);
  const participantTesthausen = await ensureExternalParticipant("SV Testhausen");
  const participantMusterstadt = await ensureExternalParticipant("FC Musterstadt");
  const participantBeispieldorf = await ensureExternalParticipant("TSV Beispieldorf");

  async function ensureGroup(name: string, displayOrder: number) {
    let group = await db.tournamentGroup.findFirst({
      where: { tenantId: tenant.id, tournamentId: tournament!.id, name },
    });
    if (!group) {
      group = await db.tournamentGroup.create({
        data: { tenantId: tenant.id, tournamentId: tournament!.id, name, displayOrder },
      });
    }
    return group;
  }

  const groupA = await ensureGroup("Gruppe A", 1);
  const groupB = await ensureGroup("Gruppe B", 2);

  async function assignToGroup(participant: { id: string; groupId: string | null }, groupId: string) {
    if (participant.groupId !== groupId) {
      await db.tournamentParticipant.update({ where: { id: participant.id }, data: { groupId } });
    }
  }
  await assignToGroup(participantE1, groupA.id);
  await assignToGroup(participantTesthausen, groupA.id);
  await assignToGroup(participantMusterstadt, groupB.id);
  await assignToGroup(participantBeispieldorf, groupB.id);

  const existingTournamentVenue = await db.tournamentVenue.findFirst({
    where: { tenantId: tenant.id, tournamentId: tournament.id, venueId: venue.id },
  });
  if (!existingTournamentVenue) {
    await db.tournamentVenue.create({
      data: { tenantId: tenant.id, tournamentId: tournament.id, venueId: venue.id, displayOrder: 1, label: "Hauptplatz" },
    });
  }

  const tournamentMatchStartsAt = new Date("2026-10-03T08:00:00.000Z"); // 10:00 Europe/Berlin (CET)
  const existingTournamentMatch = await db.footballMatch.findFirst({
    where: {
      tenantId: tenant.id,
      tournamentId: tournament.id,
      homeParticipantId: participantE1.id,
      awayParticipantId: participantTesthausen.id,
    },
  });
  if (!existingTournamentMatch) {
    await db.footballMatch.create({
      data: {
        tenantId: tenant.id,
        tournamentId: tournament.id,
        tournamentGroupId: groupA.id,
        homeParticipantId: participantE1.id,
        awayParticipantId: participantTesthausen.id,
        venueId: venue.id,
        startsAt: tournamentMatchStartsAt,
        type: "TOURNAMENT",
        status: "SCHEDULED",
        homeAway: "HOME",
      },
    });
  }

  console.log(`Seeded tournament "${tournament.name}" (${tournament.id})`);
  console.log(`Seeded 4 tournament participants (1 internal, 3 external) across 2 groups.`);
  console.log(`Seeded 1 tournament venue assignment and 1 manual tournament match.`);

  // Phase 12: a SECOND, separate demo tournament specifically for
  // demonstrating/E2E-testing the automatic schedule generator —
  // deliberately NOT the Phase 11 "Verevia Jugendcup 2026" above, which
  // already carries a manually-created tournament match (and the schedule
  // generator refuses to commit for a tournament that already has one, see
  // TournamentScheduleService.commit). Participants + one group, but no
  // matches, so the generator's preview/commit flow is actually
  // demonstrable end-to-end against seed data. Idempotent like the rest of
  // this file.
  let scheduleDemoTournament = await db.footballTournament.findFirst({
    where: { tenantId: tenant.id, departmentId: department.id, name: "Verevia Frühjahrscup 2026" },
  });
  if (!scheduleDemoTournament) {
    scheduleDemoTournament = await db.footballTournament.create({
      data: {
        tenantId: tenant.id,
        departmentId: department.id,
        seasonId: season.id,
        name: "Verevia Frühjahrscup 2026",
        description: "Fiktives Turnier zur Demonstration der automatischen Spielplanerstellung.",
        startsAt: new Date("2026-11-14T09:00:00.000Z"), // 10:00 Europe/Berlin (CET)
        endsAt: new Date("2026-11-14T17:00:00.000Z"), // 18:00 Europe/Berlin (CET)
        status: "PLANNED",
        mode: "GROUPS",
      },
    });
  }

  const e2TeamSeason = teamSeasonsByTeamName.get("E2")!;

  async function ensureDemoInternalParticipant(teamSeasonId: string) {
    let participant = await db.tournamentParticipant.findFirst({
      where: { tenantId: tenant.id, tournamentId: scheduleDemoTournament!.id, teamSeasonId },
    });
    if (!participant) {
      participant = await db.tournamentParticipant.create({
        data: { tenantId: tenant.id, tournamentId: scheduleDemoTournament!.id, teamSeasonId },
      });
    }
    return participant;
  }

  async function ensureDemoExternalParticipant(externalName: string) {
    let participant = await db.tournamentParticipant.findFirst({
      where: { tenantId: tenant.id, tournamentId: scheduleDemoTournament!.id, externalName },
    });
    if (!participant) {
      participant = await db.tournamentParticipant.create({
        data: { tenantId: tenant.id, tournamentId: scheduleDemoTournament!.id, externalName },
      });
    }
    return participant;
  }

  const demoParticipantE2 = await ensureDemoInternalParticipant(e2TeamSeason.id);
  const demoParticipantAlpha = await ensureDemoExternalParticipant("SV Frühjahrsstart");
  const demoParticipantBeta = await ensureDemoExternalParticipant("FC Platzhirsch");
  const demoParticipantGamma = await ensureDemoExternalParticipant("TSV Kickfreunde");

  let scheduleDemoGroup = await db.tournamentGroup.findFirst({
    where: { tenantId: tenant.id, tournamentId: scheduleDemoTournament.id, name: "Gruppe A" },
  });
  if (!scheduleDemoGroup) {
    scheduleDemoGroup = await db.tournamentGroup.create({
      data: { tenantId: tenant.id, tournamentId: scheduleDemoTournament.id, name: "Gruppe A", displayOrder: 1 },
    });
  }

  for (const participant of [demoParticipantE2, demoParticipantAlpha, demoParticipantBeta, demoParticipantGamma]) {
    if (participant.groupId !== scheduleDemoGroup.id) {
      await db.tournamentParticipant.update({ where: { id: participant.id }, data: { groupId: scheduleDemoGroup.id } });
    }
  }

  const existingDemoTournamentVenue = await db.tournamentVenue.findFirst({
    where: { tenantId: tenant.id, tournamentId: scheduleDemoTournament.id, venueId: venue.id },
  });
  if (!existingDemoTournamentVenue) {
    await db.tournamentVenue.create({
      data: { tenantId: tenant.id, tournamentId: scheduleDemoTournament.id, venueId: venue.id, displayOrder: 1 },
    });
  }

  console.log(`Seeded tournament "${scheduleDemoTournament.name}" (${scheduleDemoTournament.id})`);
  console.log(`Seeded 4 participants in 1 group, 1 venue assignment, deliberately NO matches (schedule generator demo).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
