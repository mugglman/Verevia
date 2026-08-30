import { describe, expect, it } from "vitest";
import { computeSeedOrder, generateKnockoutBracket } from "./knockout-bracket.generator";
import { SlotSource } from "./knockout-types";

function teamSources(n: number): SlotSource[] {
  return Array.from({ length: n }, (_, i) => ({ type: "TEAM" as const, participantId: `p${i + 1}` }));
}

function groupSources(n: number): SlotSource[] {
  return Array.from({ length: n }, (_, i) => ({ type: "GROUP_POSITION" as const, groupId: `g${((i % 2) + 1)}`, position: Math.floor(i / 2) + 1 }));
}

describe("computeSeedOrder", () => {
  it("matches the standard 1v8, 4v5, 2v7, 3v6 pattern for 8 entrants", () => {
    expect(computeSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("2 entrants → [1, 2]", () => {
    expect(computeSeedOrder(2)).toEqual([1, 2]);
  });

  it("4 entrants → [1, 4, 2, 3]", () => {
    expect(computeSeedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it("is deterministic", () => {
    expect(computeSeedOrder(16)).toEqual(computeSeedOrder(16));
  });
});

describe("generateKnockoutBracket", () => {
  it("2 teams → exactly 1 match (the final)", () => {
    const bracket = generateKnockoutBracket(teamSources(2), false);
    expect(bracket.matches).toHaveLength(1);
    expect(bracket.matches[0]!.key).toBe("FINAL");
    expect(bracket.matches[0]!.round).toBe("FINAL");
    expect(bracket.matches[0]!.home).toEqual({ type: "TEAM", participantId: "p1" });
    expect(bracket.matches[0]!.away).toEqual({ type: "TEAM", participantId: "p2" });
  });

  it("4 teams → 2 semifinals + 1 final, no third place by default", () => {
    const bracket = generateKnockoutBracket(teamSources(4), false);
    expect(bracket.matches.map((m) => m.key)).toEqual(["SF-1", "SF-2", "FINAL"]);
    expect(bracket.matches.find((m) => m.key === "FINAL")!.home).toEqual({ type: "WINNER_OF_MATCH", matchKey: "SF-1" });
    expect(bracket.matches.find((m) => m.key === "FINAL")!.away).toEqual({ type: "WINNER_OF_MATCH", matchKey: "SF-2" });
  });

  it("4 teams + third place → SF-1, SF-2, THIRD-PLACE, FINAL, with correct loser references", () => {
    const bracket = generateKnockoutBracket(teamSources(4), true);
    expect(bracket.matches.map((m) => m.key)).toEqual(["SF-1", "SF-2", "THIRD-PLACE", "FINAL"]);
    const thirdPlace = bracket.matches.find((m) => m.key === "THIRD-PLACE")!;
    expect(thirdPlace.round).toBe("THIRD_PLACE");
    expect(thirdPlace.home).toEqual({ type: "LOSER_OF_MATCH", matchKey: "SF-1" });
    expect(thirdPlace.away).toEqual({ type: "LOSER_OF_MATCH", matchKey: "SF-2" });
  });

  it("8 teams → 4 quarterfinals + 2 semifinals + 1 final, correct dependency chain", () => {
    const bracket = generateKnockoutBracket(teamSources(8), false);
    expect(bracket.matches.map((m) => m.key)).toEqual(["QF-1", "QF-2", "QF-3", "QF-4", "SF-1", "SF-2", "FINAL"]);
    const sf1 = bracket.matches.find((m) => m.key === "SF-1")!;
    expect(sf1.home).toEqual({ type: "WINNER_OF_MATCH", matchKey: "QF-1" });
    expect(sf1.away).toEqual({ type: "WINNER_OF_MATCH", matchKey: "QF-2" });
    const sf2 = bracket.matches.find((m) => m.key === "SF-2")!;
    expect(sf2.home).toEqual({ type: "WINNER_OF_MATCH", matchKey: "QF-3" });
    expect(sf2.away).toEqual({ type: "WINNER_OF_MATCH", matchKey: "QF-4" });
  });

  it("QF-1 pairs seed 1 vs seed 8 (standard bracket seeding, work order example)", () => {
    const bracket = generateKnockoutBracket(teamSources(8), false);
    const qf1 = bracket.matches.find((m) => m.key === "QF-1")!;
    expect(qf1.home).toEqual({ type: "TEAM", participantId: "p1" });
    expect(qf1.away).toEqual({ type: "TEAM", participantId: "p8" });
    const qf2 = bracket.matches.find((m) => m.key === "QF-2")!;
    expect(qf2.home).toEqual({ type: "TEAM", participantId: "p4" });
    expect(qf2.away).toEqual({ type: "TEAM", participantId: "p5" });
  });

  it("16 teams → round of 16 + quarterfinals + semifinals + final (Achtelfinale, generic algorithm, no special case)", () => {
    const bracket = generateKnockoutBracket(teamSources(16), false);
    const byRound = new Map<string, number>();
    for (const m of bracket.matches) byRound.set(m.round, (byRound.get(m.round) ?? 0) + 1);
    expect(byRound.get("ROUND_OF_16")).toBe(8);
    expect(byRound.get("QUARTERFINAL")).toBe(4);
    expect(byRound.get("SEMIFINAL")).toBe(2);
    expect(byRound.get("FINAL")).toBe(1);
    expect(bracket.matches).toHaveLength(15);
  });

  it("accepts GROUP_POSITION sources identically to TEAM sources (opaque to the generator)", () => {
    const bracket = generateKnockoutBracket(groupSources(4), false);
    expect(bracket.matches.map((m) => m.key)).toEqual(["SF-1", "SF-2", "FINAL"]);
    expect(bracket.matches[0]!.home).toEqual({ type: "GROUP_POSITION", groupId: "g1", position: 1 });
  });

  it("supports mixed TEAM and GROUP_POSITION entrants in the same bracket", () => {
    const entrants: SlotSource[] = [
      { type: "TEAM", participantId: "p1" },
      { type: "GROUP_POSITION", groupId: "g1", position: 2 },
    ];
    const bracket = generateKnockoutBracket(entrants, false);
    expect(bracket.matches).toHaveLength(1);
    expect(bracket.matches[0]!.home).toEqual({ type: "TEAM", participantId: "p1" });
    expect(bracket.matches[0]!.away).toEqual({ type: "GROUP_POSITION", groupId: "g1", position: 2 });
  });

  describe("BYE handling", () => {
    it("6 entrants in an 8-slot bracket: seeds 7 and 8 get a BYE, seeds 1 and 2 advance without a match", () => {
      const bracket = generateKnockoutBracket(teamSources(6), false);
      // Round 1 (QF) should have only 2 real matches (4v5, 3v6) — 1v8 and
      // 2v7 are BYEs and produce no match at all.
      const qfMatches = bracket.matches.filter((m) => m.round === "QUARTERFINAL");
      expect(qfMatches).toHaveLength(2);
      const qfKeys = qfMatches.map((m) => m.key);
      expect(qfKeys).toEqual(["QF-1", "QF-2"]); // re-numbered — no gaps for skipped BYE pairs
      // p1 (seed 1, byed) and p2 (seed 2, byed) feed DIRECTLY into the
      // semifinals as TEAM sources, not as WINNER_OF_MATCH.
      const semifinals = bracket.matches.filter((m) => m.round === "SEMIFINAL");
      expect(semifinals).toHaveLength(2);
      const allSemifinalSources = semifinals.flatMap((m) => [m.home, m.away]);
      expect(allSemifinalSources).toContainEqual({ type: "TEAM", participantId: "p1" });
      expect(allSemifinalSources).toContainEqual({ type: "TEAM", participantId: "p2" });
    });

    it("a BYE never produces a match (total real match count = entrants - 1, standard KO invariant)", () => {
      for (const n of [2, 3, 4, 5, 6, 7, 8]) {
        const bracket = generateKnockoutBracket(teamSources(n), false);
        expect(bracket.matches).toHaveLength(n - 1);
      }
    });

    it("multiple simultaneous BYEs (5 entrants in an 8-slot bracket) still produce a fully connected, dependency-consistent bracket", () => {
      const bracket = generateKnockoutBracket(teamSources(5), false);
      expect(bracket.matches).toHaveLength(4); // 5 - 1
      expect(bracket.matches.map((m) => m.key)).toEqual(["QF-1", "SF-1", "SF-2", "FINAL"]);
    });
  });

  it("match keys are stable and deterministic across repeated calls with identical input", () => {
    const first = generateKnockoutBracket(teamSources(8), true);
    const second = generateKnockoutBracket(teamSources(8), true);
    expect(second).toEqual(first);
  });

  it("does not create a third-place match when includeThirdPlace is false", () => {
    const bracket = generateKnockoutBracket(teamSources(8), false);
    expect(bracket.matches.some((m) => m.key === "THIRD-PLACE")).toBe(false);
  });

  it("does not create a third-place match for a 2-entrant (final-only) bracket even if requested", () => {
    const bracket = generateKnockoutBracket(teamSources(2), true);
    expect(bracket.matches.some((m) => m.key === "THIRD-PLACE")).toBe(false);
    expect(bracket.matches).toHaveLength(1);
  });
});
