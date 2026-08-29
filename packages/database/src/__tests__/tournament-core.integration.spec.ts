import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTenantPrisma } from "../tenant-prisma";
import { createAdminPrismaForTests } from "../test-utils";

/**
 * DB-level integration tests for the Phase 11 tournament core
 * (FootballTournament, TournamentParticipant, TournamentVenue,
 * TournamentGroup, and the FootballMatch tournament-mode extension —
 * see ADR 0008). Not part of `pnpm test` (needs a real PostgreSQL
 * instance), same reasoning as match-foundation.integration.spec.ts.
 * Run via `pnpm test:integration`.
 */

const rawPrisma = new PrismaClient(); // uses DATABASE_URL — must be the restricted verevia_app role
const adminPrisma = createAdminPrismaForTests();

let tenantAId: string;
let tenantBId: string;
let departmentFootballAId: string;
let departmentFootballBId: string;
let departmentTennisAId: string;
let teamE1AId: string;
let teamE1BId: string;
let seasonAId: string;
let seasonBId: string;
let seasonTennisAId: string;
let ageGroupAId: string;
let ageGroupBId: string;
let teamSeasonAId: string;
let teamSeasonBId: string;
let venueAId: string;
let venueBId: string;
let tournamentAId: string;
let tournamentA2Id: string; // second tournament in tenant A, same department — for "wrong tournament" tests
let tournamentBId: string;

beforeAll(async () => {
  const tenantA = await adminPrisma.tenant.create({
    data: { name: "Tournament Core Test Tenant A", slug: `tournament-core-a-${Date.now()}` },
  });
  const tenantB = await adminPrisma.tenant.create({
    data: { name: "Tournament Core Test Tenant B", slug: `tournament-core-b-${Date.now()}` },
  });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const departmentFootballA = await adminPrisma.department.create({
    data: { tenantId: tenantAId, name: "Fußball", sportType: "FOOTBALL" },
  });
  const departmentFootballB = await adminPrisma.department.create({
    data: { tenantId: tenantBId, name: "Fußball", sportType: "FOOTBALL" },
  });
  const departmentTennisA = await adminPrisma.department.create({
    data: { tenantId: tenantAId, name: "Tennis", sportType: "TENNIS" },
  });
  departmentFootballAId = departmentFootballA.id;
  departmentFootballBId = departmentFootballB.id;
  departmentTennisAId = departmentTennisA.id;

  const teamE1A = await adminPrisma.team.create({
    data: { tenantId: tenantAId, departmentId: departmentFootballAId, name: "E1" },
  });
  const teamE1B = await adminPrisma.team.create({
    data: { tenantId: tenantBId, departmentId: departmentFootballBId, name: "E1" },
  });
  teamE1AId = teamE1A.id;
  teamE1BId = teamE1B.id;

  const seasonA = await adminPrisma.season.create({
    data: {
      tenantId: tenantAId,
      departmentId: departmentFootballAId,
      name: "2026/2027",
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2027-06-30"),
      status: "ACTIVE",
    },
  });
  const seasonB = await adminPrisma.season.create({
    data: {
      tenantId: tenantBId,
      departmentId: departmentFootballBId,
      name: "2026/2027",
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2027-06-30"),
      status: "ACTIVE",
    },
  });
  const seasonTennisA = await adminPrisma.season.create({
    data: {
      tenantId: tenantAId,
      departmentId: departmentTennisAId,
      name: "2026 Tennis-Saison",
      startsAt: new Date("2026-04-01"),
      endsAt: new Date("2026-10-31"),
      status: "ACTIVE",
    },
  });
  seasonAId = seasonA.id;
  seasonBId = seasonB.id;
  seasonTennisAId = seasonTennisA.id;

  const ageGroupA = await adminPrisma.ageGroup.create({
    data: { tenantId: tenantAId, name: "E-Jugend", sortOrder: 1 },
  });
  const ageGroupB = await adminPrisma.ageGroup.create({
    data: { tenantId: tenantBId, name: "E-Jugend", sortOrder: 1 },
  });
  ageGroupAId = ageGroupA.id;
  ageGroupBId = ageGroupB.id;

  const teamSeasonA = await adminPrisma.teamSeason.create({
    data: { tenantId: tenantAId, teamId: teamE1AId, seasonId: seasonAId, ageGroupId: ageGroupAId },
  });
  const teamSeasonB = await adminPrisma.teamSeason.create({
    data: { tenantId: tenantBId, teamId: teamE1BId, seasonId: seasonBId, ageGroupId: ageGroupBId },
  });
  teamSeasonAId = teamSeasonA.id;
  teamSeasonBId = teamSeasonB.id;

  const venueA = await adminPrisma.venue.create({ data: { tenantId: tenantAId, name: "Sportplatz A" } });
  const venueB = await adminPrisma.venue.create({ data: { tenantId: tenantBId, name: "Sportplatz B" } });
  venueAId = venueA.id;
  venueBId = venueB.id;

  const tournamentA = await adminPrisma.footballTournament.create({
    data: {
      tenantId: tenantAId,
      departmentId: departmentFootballAId,
      name: "Test-Cup A",
      startsAt: new Date("2026-10-03T07:00:00.000Z"),
      status: "PLANNED",
      mode: "GROUPS",
    },
  });
  const tournamentA2 = await adminPrisma.footballTournament.create({
    data: {
      tenantId: tenantAId,
      departmentId: departmentFootballAId,
      name: "Test-Cup A (Zweitturnier)",
      startsAt: new Date("2026-11-01T07:00:00.000Z"),
      status: "DRAFT",
    },
  });
  const tournamentB = await adminPrisma.footballTournament.create({
    data: {
      tenantId: tenantBId,
      departmentId: departmentFootballBId,
      name: "Test-Cup B",
      startsAt: new Date("2026-10-03T07:00:00.000Z"),
      status: "PLANNED",
    },
  });
  tournamentAId = tournamentA.id;
  tournamentA2Id = tournamentA2.id;
  tournamentBId = tournamentB.id;
});

afterAll(async () => {
  await adminPrisma.footballMatch.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentParticipant.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tournamentVenue.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.footballTournament.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.venue.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.teamSeason.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.ageGroup.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.season.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.team.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.department.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await adminPrisma.$disconnect();
  await rawPrisma.$disconnect();
});

describe("FootballTournament — tenant isolation", () => {
  it("Tenant B does NOT see Tenant A's tournament", async () => {
    const dbB = getTenantPrisma(tenantBId);
    const tournament = await dbB.footballTournament.findUnique({ where: { id: tournamentAId } });
    expect(tournament).toBeNull();
  });

  it("a connection with no app.tenant_id set sees NO tournament rows", async () => {
    const tournaments = await rawPrisma.footballTournament.findMany({
      where: { id: { in: [tournamentAId, tournamentBId] } },
    });
    expect(tournaments).toHaveLength(0);
  });
});

describe("FootballTournament — cross-tenant/cross-department rejection", () => {
  it("rejects a tournament with tenantId=A but departmentId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballTournament.create({
        data: {
          tenantId: tenantAId,
          departmentId: departmentFootballBId,
          name: "Illegal Cup",
          startsAt: new Date("2026-10-03T07:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a tournament bound to a Season from a DIFFERENT department (e.g. Tennis)", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballTournament.create({
        data: {
          tenantId: tenantAId,
          departmentId: departmentFootballAId,
          seasonId: seasonTennisAId,
          name: "Illegal Cup 2",
          startsAt: new Date("2026-10-03T07:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts a tournament bound to a Season from the SAME department", async () => {
    const db = getTenantPrisma(tenantAId);
    const tournament = await db.footballTournament.create({
      data: {
        tenantId: tenantAId,
        departmentId: departmentFootballAId,
        seasonId: seasonAId,
        name: "Legal Cup",
        startsAt: new Date("2026-10-03T07:00:00.000Z"),
      },
    });
    expect(tournament.seasonId).toBe(seasonAId);
    await adminPrisma.footballTournament.delete({ where: { id: tournament.id } });
  });

  it("rejects an endsAt before startsAt (date range CHECK)", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballTournament.create({
        data: {
          tenantId: tenantAId,
          departmentId: departmentFootballAId,
          name: "Illegal Cup 3",
          startsAt: new Date("2026-10-03T07:00:00.000Z"),
          endsAt: new Date("2026-10-01T07:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("TournamentParticipant — internal/external XOR", () => {
  it("rejects a participant with BOTH teamSeasonId and externalName set", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.tournamentParticipant.create({
        data: {
          tenantId: tenantAId,
          tournamentId: tournamentAId,
          teamSeasonId: teamSeasonAId,
          externalName: "SV Beide",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a participant with NEITHER teamSeasonId nor externalName set", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.tournamentParticipant.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId },
      }),
    ).rejects.toThrow();
  });

  it("accepts an internal-only participant (teamSeasonId)", async () => {
    const db = getTenantPrisma(tenantAId);
    const participant = await db.tournamentParticipant.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, teamSeasonId: teamSeasonAId },
    });
    expect(participant.teamSeasonId).toBe(teamSeasonAId);
    expect(participant.externalName).toBeNull();
  });

  it("accepts an external-only participant (externalName)", async () => {
    const db = getTenantPrisma(tenantAId);
    const participant = await db.tournamentParticipant.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, externalName: "SV Testhausen" },
    });
    expect(participant.externalName).toBe("SV Testhausen");
    expect(participant.teamSeasonId).toBeNull();
  });

  it("rejects a participant with tenantId=A but teamSeasonId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.tournamentParticipant.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, teamSeasonId: teamSeasonBId },
      }),
    ).rejects.toThrow();
  });
});

describe("TournamentParticipant — duplicate prevention", () => {
  it("rejects the same internal TeamSeason twice in the same tournament", async () => {
    const db = getTenantPrisma(tenantAId);
    // teamSeasonAId was already added as a participant of tournamentAId above.
    await expect(
      db.tournamentParticipant.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, teamSeasonId: teamSeasonAId },
      }),
    ).rejects.toThrow();
  });

  it("rejects the same external name twice in the same tournament (case-insensitive)", async () => {
    const db = getTenantPrisma(tenantAId);
    // "SV Testhausen" was already added above; "sv testhausen" must collide.
    await expect(
      db.tournamentParticipant.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, externalName: "sv testhausen" },
      }),
    ).rejects.toThrow();
  });

  it("allows the SAME external name in a DIFFERENT tournament (duplicate check is per-tournament)", async () => {
    const db = getTenantPrisma(tenantAId);
    const participant = await db.tournamentParticipant.create({
      data: { tenantId: tenantAId, tournamentId: tournamentA2Id, externalName: "SV Testhausen" },
    });
    expect(participant.externalName).toBe("SV Testhausen");
    await adminPrisma.tournamentParticipant.delete({ where: { id: participant.id } });
  });
});

describe("TournamentVenue / TournamentGroup — cross-tenant rejection", () => {
  it("rejects a TournamentVenue with tenantId=A but venueId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.tournamentVenue.create({
        data: { tenantId: tenantAId, tournamentId: tournamentAId, venueId: venueBId },
      }),
    ).rejects.toThrow();
  });

  it("rejects a TournamentVenue with tenantId=A but tournamentId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.tournamentVenue.create({
        data: { tenantId: tenantAId, tournamentId: tournamentBId, venueId: venueAId },
      }),
    ).rejects.toThrow();
  });

  it("accepts a TournamentVenue where tournament and venue both belong to the SAME tenant", async () => {
    const db = getTenantPrisma(tenantAId);
    const tv = await db.tournamentVenue.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, venueId: venueAId, label: "Hauptplatz" },
    });
    expect(tv.venueId).toBe(venueAId);
  });

  it("rejects a TournamentGroup with tenantId=A but tournamentId belonging to tenant B", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.tournamentGroup.create({
        data: { tenantId: tenantAId, tournamentId: tournamentBId, name: "Illegal Gruppe" },
      }),
    ).rejects.toThrow();
  });

  it("accepts a TournamentGroup belonging to the same tenant/tournament", async () => {
    const db = getTenantPrisma(tenantAId);
    const group = await db.tournamentGroup.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, name: "Gruppe A" },
    });
    expect(group.tournamentId).toBe(tournamentAId);
  });
});

describe("FootballMatch — tournament mode consistency (ADR 0008)", () => {
  let homeParticipantId: string;
  let awayParticipantId: string;
  let groupId: string;

  beforeAll(async () => {
    const db = getTenantPrisma(tenantAId);
    const home = await db.tournamentParticipant.findFirst({
      where: { tournamentId: tournamentAId, teamSeasonId: teamSeasonAId },
    });
    const away = await db.tournamentParticipant.findFirst({
      where: { tournamentId: tournamentAId, externalName: "SV Testhausen" },
    });
    const group = await db.tournamentGroup.findFirst({ where: { tournamentId: tournamentAId, name: "Gruppe A" } });
    homeParticipantId = home!.id;
    awayParticipantId = away!.id;
    groupId = group!.id;
  });

  it("accepts a valid tournament match (tournamentId + distinct home/away participants)", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: {
        tenantId: tenantAId,
        tournamentId: tournamentAId,
        tournamentGroupId: groupId,
        homeParticipantId,
        awayParticipantId,
        startsAt: new Date("2026-10-03T08:00:00.000Z"),
        type: "TOURNAMENT",
        homeAway: "HOME",
      },
    });
    expect(match.tournamentId).toBe(tournamentAId);
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("rejects a match with BOTH teamSeasonId and tournamentId set (mode_consistency CHECK)", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballMatch.create({
        data: {
          tenantId: tenantAId,
          teamSeasonId: teamSeasonAId,
          opponentName: "Test-Gegner",
          tournamentId: tournamentAId,
          homeParticipantId,
          awayParticipantId,
          startsAt: new Date("2026-10-03T08:00:00.000Z"),
          type: "TOURNAMENT",
          homeAway: "HOME",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a match with NEITHER club-match nor tournament-match fields set (mode_consistency CHECK)", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballMatch.create({
        data: {
          tenantId: tenantAId,
          startsAt: new Date("2026-10-03T08:00:00.000Z"),
          type: "FRIENDLY",
          homeAway: "HOME",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects homeParticipantId === awayParticipantId (a participant cannot play itself)", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballMatch.create({
        data: {
          tenantId: tenantAId,
          tournamentId: tournamentAId,
          homeParticipantId,
          awayParticipantId: homeParticipantId,
          startsAt: new Date("2026-10-03T08:00:00.000Z"),
          type: "TOURNAMENT",
          homeAway: "HOME",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a tournament match (tournamentId set) whose type is NOT TOURNAMENT", async () => {
    const db = getTenantPrisma(tenantAId);
    await expect(
      db.footballMatch.create({
        data: {
          tenantId: tenantAId,
          tournamentId: tournamentAId,
          homeParticipantId,
          awayParticipantId,
          startsAt: new Date("2026-10-03T08:00:00.000Z"),
          type: "FRIENDLY",
          homeAway: "HOME",
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts a club match with type=TOURNAMENT but NO Verevia tournamentId (externally-organized tournament)", async () => {
    const db = getTenantPrisma(tenantAId);
    const match = await db.footballMatch.create({
      data: {
        tenantId: tenantAId,
        teamSeasonId: teamSeasonAId,
        opponentName: "Externes Turnier — Gegner XY",
        startsAt: new Date("2026-10-03T08:00:00.000Z"),
        type: "TOURNAMENT",
        homeAway: "HOME",
      },
    });
    expect(match.tournamentId).toBeNull();
    expect(match.type).toBe("TOURNAMENT");
    await adminPrisma.footballMatch.delete({ where: { id: match.id } });
  });

  it("rejects a homeParticipantId belonging to a DIFFERENT tournament (same tenant) — composite-FK 'wrong tournament' guardrail", async () => {
    const db = getTenantPrisma(tenantAId);
    const otherTournamentParticipant = await db.tournamentParticipant.create({
      data: { tenantId: tenantAId, tournamentId: tournamentA2Id, externalName: "FC Fremdturnier" },
    });
    await expect(
      db.footballMatch.create({
        data: {
          tenantId: tenantAId,
          tournamentId: tournamentAId, // mismatched — participant belongs to tournamentA2
          homeParticipantId: otherTournamentParticipant.id,
          awayParticipantId,
          startsAt: new Date("2026-10-03T08:00:00.000Z"),
          type: "TOURNAMENT",
          homeAway: "HOME",
        },
      }),
    ).rejects.toThrow();
    await adminPrisma.tournamentParticipant.delete({ where: { id: otherTournamentParticipant.id } });
  });

  it("rejects a tournamentGroupId belonging to a DIFFERENT tournament (same tenant) — composite-FK 'wrong tournament' guardrail", async () => {
    const db = getTenantPrisma(tenantAId);
    const otherTournamentGroup = await db.tournamentGroup.create({
      data: { tenantId: tenantAId, tournamentId: tournamentA2Id, name: "Fremdgruppe" },
    });
    await expect(
      db.footballMatch.create({
        data: {
          tenantId: tenantAId,
          tournamentId: tournamentAId, // mismatched — group belongs to tournamentA2
          tournamentGroupId: otherTournamentGroup.id,
          homeParticipantId,
          awayParticipantId,
          startsAt: new Date("2026-10-03T08:00:00.000Z"),
          type: "TOURNAMENT",
          homeAway: "HOME",
        },
      }),
    ).rejects.toThrow();
    await adminPrisma.tournamentGroup.delete({ where: { id: otherTournamentGroup.id } });
  });

  it("rejects a homeParticipantId belonging to a DIFFERENT tenant", async () => {
    const dbB = getTenantPrisma(tenantBId);
    const participantB = await dbB.tournamentParticipant.create({
      data: { tenantId: tenantBId, tournamentId: tournamentBId, externalName: "Fremdverein B" },
    });
    const dbA = getTenantPrisma(tenantAId);
    await expect(
      dbA.footballMatch.create({
        data: {
          tenantId: tenantAId,
          tournamentId: tournamentAId,
          homeParticipantId: participantB.id,
          awayParticipantId,
          startsAt: new Date("2026-10-03T08:00:00.000Z"),
          type: "TOURNAMENT",
          homeAway: "HOME",
        },
      }),
    ).rejects.toThrow();
    await adminPrisma.tournamentParticipant.delete({ where: { id: participantB.id } });
  });
});

describe("PostgreSQL RLS — tenant isolation (tournament core)", () => {
  it("Tenant B does NOT see Tenant A's TournamentParticipant", async () => {
    const dbA = getTenantPrisma(tenantAId);
    const participant = await dbA.tournamentParticipant.create({
      data: { tenantId: tenantAId, tournamentId: tournamentAId, externalName: `RLS-Test-${Date.now()}` },
    });

    const dbB = getTenantPrisma(tenantBId);
    const seenByB = await dbB.tournamentParticipant.findUnique({ where: { id: participant.id } });
    expect(seenByB).toBeNull();

    const rawSeen = await rawPrisma.tournamentParticipant.findUnique({ where: { id: participant.id } });
    expect(rawSeen).toBeNull();

    await adminPrisma.tournamentParticipant.delete({ where: { id: participant.id } });
  });

  it("Tenant B cannot update Tenant A's FootballTournament", async () => {
    const dbB = getTenantPrisma(tenantBId);
    await expect(
      dbB.footballTournament.update({ where: { id: tournamentAId }, data: { name: "Hijacked" } }),
    ).rejects.toThrow();

    const dbA = getTenantPrisma(tenantAId);
    const stillA = await dbA.footballTournament.findUnique({ where: { id: tournamentAId } });
    expect(stillA?.name).toBe("Test-Cup A");
  });
});
