import { describe, expect, it } from "vitest";
import { computeGroupStandings, type GroupMatchResult } from "./group-standings";

const A = "participant-a";
const B = "participant-b";
const C = "participant-c";
const D = "participant-d";

function row(rows: ReturnType<typeof computeGroupStandings>, participantId: string) {
  return rows.find((r) => r.participantId === participantId)!;
}

describe("computeGroupStandings", () => {
  it("returns an empty table for an empty group", () => {
    expect(computeGroupStandings([], [])).toEqual([]);
  });

  it("lists every participant at zero played/points before any match is completed", () => {
    const rows = computeGroupStandings([A, B], []);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.played).toBe(0);
      expect(r.points).toBe(0);
      expect(r.goalDifference).toBe(0);
    }
  });

  it("awards 3 points for a win, 0 for a loss", () => {
    const matches: GroupMatchResult[] = [{ homeParticipantId: A, awayParticipantId: B, homeScore: 2, awayScore: 0 }];
    const rows = computeGroupStandings([A, B], matches);
    expect(row(rows, A)).toMatchObject({ played: 1, wins: 1, draws: 0, losses: 0, points: 3, goalsFor: 2, goalsAgainst: 0, goalDifference: 2 });
    expect(row(rows, B)).toMatchObject({ played: 1, wins: 0, draws: 0, losses: 1, points: 0, goalsFor: 0, goalsAgainst: 2, goalDifference: -2 });
  });

  it("awards 1 point each for a draw", () => {
    const matches: GroupMatchResult[] = [{ homeParticipantId: A, awayParticipantId: B, homeScore: 1, awayScore: 1 }];
    const rows = computeGroupStandings([A, B], matches);
    expect(row(rows, A)).toMatchObject({ played: 1, wins: 0, draws: 1, losses: 0, points: 1 });
    expect(row(rows, B)).toMatchObject({ played: 1, wins: 0, draws: 1, losses: 0, points: 1 });
  });

  it("accumulates points/goals correctly across multiple matches", () => {
    const matches: GroupMatchResult[] = [
      { homeParticipantId: A, awayParticipantId: B, homeScore: 3, awayScore: 1 },
      { homeParticipantId: A, awayParticipantId: C, homeScore: 1, awayScore: 1 },
      { homeParticipantId: B, awayParticipantId: C, homeScore: 0, awayScore: 2 },
    ];
    const rows = computeGroupStandings([A, B, C], matches);
    expect(row(rows, A)).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, points: 4, goalsFor: 4, goalsAgainst: 2, goalDifference: 2 });
    expect(row(rows, B)).toMatchObject({ played: 2, wins: 0, draws: 0, losses: 2, points: 0, goalsFor: 1, goalsAgainst: 5, goalDifference: -4 });
    expect(row(rows, C)).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, points: 4, goalsFor: 3, goalsAgainst: 1, goalDifference: 2 });
  });

  it("ranks by points first", () => {
    const matches: GroupMatchResult[] = [{ homeParticipantId: A, awayParticipantId: B, homeScore: 1, awayScore: 0 }];
    const rows = computeGroupStandings([A, B], matches);
    expect(row(rows, A).rank).toBe(1);
    expect(row(rows, B).rank).toBe(2);
  });

  it("breaks a points tie by goal difference", () => {
    // A: win 3-0 (GD +3, 3 pts), then loses 0-1 (GD -1) -> total GD +2, 3 pts.
    // B: loses 0-3 (GD -3), then wins 2-0 (GD +2) -> total GD -1, 3 pts.
    const matches: GroupMatchResult[] = [
      { homeParticipantId: A, awayParticipantId: C, homeScore: 3, awayScore: 0 },
      { homeParticipantId: D, awayParticipantId: A, homeScore: 1, awayScore: 0 },
      { homeParticipantId: C, awayParticipantId: B, homeScore: 3, awayScore: 0 },
      { homeParticipantId: B, awayParticipantId: D, homeScore: 2, awayScore: 0 },
    ];
    const rows = computeGroupStandings([A, B, C, D], matches);
    expect(row(rows, A).points).toBe(3);
    expect(row(rows, B).points).toBe(3);
    expect(row(rows, A).goalDifference).toBe(2);
    expect(row(rows, B).goalDifference).toBe(-1);
    expect(row(rows, A).rank).toBeLessThan(row(rows, B).rank);
  });

  it("breaks a points-and-goal-difference tie by goals scored", () => {
    // Same points (3) and same GD (+1) for A and B, but A scored more goals.
    const matches: GroupMatchResult[] = [
      { homeParticipantId: A, awayParticipantId: C, homeScore: 3, awayScore: 2 }, // A: +1 GD, 3 pts, 3 goals
      { homeParticipantId: B, awayParticipantId: D, homeScore: 1, awayScore: 0 }, // B: +1 GD, 3 pts, 1 goal
    ];
    const rows = computeGroupStandings([A, B, C, D], matches);
    expect(row(rows, A).points).toBe(row(rows, B).points);
    expect(row(rows, A).goalDifference).toBe(row(rows, B).goalDifference);
    expect(row(rows, A).goalsFor).toBeGreaterThan(row(rows, B).goalsFor);
    expect(row(rows, A).rank).toBeLessThan(row(rows, B).rank);
  });

  it("marks a genuine full tie (identical points/GD/goals) with tiedRankGroupSize > 1 for every tied row", () => {
    // A and B both play exactly one match, both win 1-0 against different opponents -> fully identical stats.
    const matches: GroupMatchResult[] = [
      { homeParticipantId: A, awayParticipantId: C, homeScore: 1, awayScore: 0 },
      { homeParticipantId: B, awayParticipantId: D, homeScore: 1, awayScore: 0 },
    ];
    const rows = computeGroupStandings([A, B, C, D], matches);
    expect(row(rows, A).tiedRankGroupSize).toBe(2);
    expect(row(rows, B).tiedRankGroupSize).toBe(2);
    // Still a full deterministic total order — both get distinct ranks (1 and 2, in some fixed order).
    expect(new Set([row(rows, A).rank, row(rows, B).rank])).toEqual(new Set([1, 2]));
  });

  it("gives every row tiedRankGroupSize 1 when no two rows share the same sporting triple", () => {
    const matches: GroupMatchResult[] = [
      { homeParticipantId: A, awayParticipantId: B, homeScore: 3, awayScore: 0 },
      { homeParticipantId: C, awayParticipantId: D, homeScore: 1, awayScore: 0 },
    ];
    const rows = computeGroupStandings([A, B, C, D], matches);
    for (const r of rows) expect(r.tiedRankGroupSize).toBe(1);
  });

  it("is deterministic — the order completed matches are supplied in never changes the result", () => {
    const matches: GroupMatchResult[] = [
      { homeParticipantId: A, awayParticipantId: B, homeScore: 2, awayScore: 1 },
      { homeParticipantId: A, awayParticipantId: C, homeScore: 0, awayScore: 0 },
      { homeParticipantId: B, awayParticipantId: C, homeScore: 3, awayScore: 1 },
    ];
    const forward = computeGroupStandings([A, B, C], matches);
    const reversed = computeGroupStandings([A, B, C], [...matches].reverse());
    expect(forward).toEqual(reversed);
  });

  it("is deterministic regardless of participantIds input order", () => {
    const matches: GroupMatchResult[] = [{ homeParticipantId: A, awayParticipantId: B, homeScore: 1, awayScore: 0 }];
    const forward = computeGroupStandings([A, B], matches);
    const reversed = computeGroupStandings([B, A], matches);
    expect(forward).toEqual(reversed);
  });

  it("handles a partially played group (some matches not yet completed simply aren't passed in)", () => {
    // Only one of the group's matches has been completed so far.
    const matches: GroupMatchResult[] = [{ homeParticipantId: A, awayParticipantId: B, homeScore: 2, awayScore: 2 }];
    const rows = computeGroupStandings([A, B, C], matches);
    expect(row(rows, A).played).toBe(1);
    expect(row(rows, B).played).toBe(1);
    expect(row(rows, C).played).toBe(0);
  });

  it("handles a fully played group, producing exactly n*(n-1)/2-consistent totals", () => {
    const matches: GroupMatchResult[] = [
      { homeParticipantId: A, awayParticipantId: B, homeScore: 1, awayScore: 0 },
      { homeParticipantId: A, awayParticipantId: C, homeScore: 2, awayScore: 2 },
      { homeParticipantId: B, awayParticipantId: C, homeScore: 0, awayScore: 1 },
    ];
    const rows = computeGroupStandings([A, B, C], matches);
    expect(rows.every((r) => r.played === 2)).toBe(true);
    const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);
    // 1 decisive result (3 pts) + 1 draw (2 pts) + 1 decisive result (3 pts) = 8.
    expect(totalPoints).toBe(8);
  });
});
