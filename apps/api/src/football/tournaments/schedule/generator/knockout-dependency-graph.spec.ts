import { describe, expect, it } from "vitest";
import { validateKnockoutDependencyGraph } from "./knockout-dependency-graph";
import { KnockoutMatchConfig, SlotSource } from "./knockout-types";

const team = (id: string): SlotSource => ({ type: "TEAM", participantId: id });
const winnerOf = (key: string): SlotSource => ({ type: "WINNER_OF_MATCH", matchKey: key });
const loserOf = (key: string): SlotSource => ({ type: "LOSER_OF_MATCH", matchKey: key });

function match(key: string, round: KnockoutMatchConfig["round"], home: SlotSource, away: SlotSource): KnockoutMatchConfig {
  return { key, round, home, away };
}

describe("validateKnockoutDependencyGraph", () => {
  it("accepts a valid bracket (SF-1, SF-2, THIRD-PLACE, FINAL)", () => {
    const matches = [
      match("SF-1", "SEMIFINAL", team("p1"), team("p2")),
      match("SF-2", "SEMIFINAL", team("p3"), team("p4")),
      match("THIRD-PLACE", "THIRD_PLACE", loserOf("SF-1"), loserOf("SF-2")),
      match("FINAL", "FINAL", winnerOf("SF-1"), winnerOf("SF-2")),
    ];
    const result = validateKnockoutDependencyGraph(matches);
    expect(result.valid).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it("accepts a bracket with no dependencies at all (single match, both direct sources)", () => {
    const result = validateKnockoutDependencyGraph([match("FINAL", "FINAL", team("p1"), team("p2"))]);
    expect(result.valid).toBe(true);
  });

  it("detects a self-reference", () => {
    const matches = [match("FINAL", "FINAL", winnerOf("FINAL"), team("p2"))];
    const result = validateKnockoutDependencyGraph(matches);
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "SELF_REFERENCE")).toBe(true);
  });

  it("detects a reference to an unknown match", () => {
    const matches = [match("FINAL", "FINAL", winnerOf("SF-1"), team("p2"))]; // SF-1 doesn't exist in this set
    const result = validateKnockoutDependencyGraph(matches);
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "UNKNOWN_MATCH_REFERENCE")).toBe(true);
  });

  it("detects a cycle (A depends on B, B depends on A)", () => {
    const matches = [match("A", "SEMIFINAL", winnerOf("B"), team("p1")), match("B", "SEMIFINAL", winnerOf("A"), team("p2"))];
    const result = validateKnockoutDependencyGraph(matches);
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "DEPENDENCY_CYCLE")).toBe(true);
  });

  it("detects a longer cycle (A -> B -> C -> A)", () => {
    const matches = [
      match("A", "QUARTERFINAL", winnerOf("C"), team("p1")),
      match("B", "SEMIFINAL", winnerOf("A"), team("p2")),
      match("C", "FINAL", winnerOf("B"), team("p3")),
    ];
    const result = validateKnockoutDependencyGraph(matches);
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "DEPENDENCY_CYCLE")).toBe(true);
  });

  it("detects a dependency that violates round order (source comes after dependent in the array)", () => {
    // FINAL is listed BEFORE SF-1 here, even though FINAL depends on SF-1 — invalid ordering.
    const matches = [match("FINAL", "FINAL", winnerOf("SF-1"), team("p2")), match("SF-1", "SEMIFINAL", team("p3"), team("p4"))];
    const result = validateKnockoutDependencyGraph(matches);
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "DEPENDENCY_ROUND_ORDER")).toBe(true);
  });

  it("accepts LOSER_OF_MATCH the same way as WINNER_OF_MATCH", () => {
    const matches = [
      match("SF-1", "SEMIFINAL", team("p1"), team("p2")),
      match("SF-2", "SEMIFINAL", team("p3"), team("p4")),
      match("THIRD-PLACE", "THIRD_PLACE", loserOf("SF-1"), loserOf("SF-2")),
    ];
    const result = validateKnockoutDependencyGraph(matches);
    expect(result.valid).toBe(true);
  });

  it("GROUP_POSITION sources never create a dependency edge", () => {
    const matches = [match("FINAL", "FINAL", { type: "GROUP_POSITION", groupId: "g1", position: 1 }, team("p2"))];
    const result = validateKnockoutDependencyGraph(matches);
    expect(result.valid).toBe(true);
  });

  it("collects multiple independent conflicts in one pass", () => {
    const matches = [
      match("A", "SEMIFINAL", winnerOf("A"), team("p1")), // self-reference
      match("B", "FINAL", winnerOf("UNKNOWN"), team("p2")), // unknown reference
    ];
    const result = validateKnockoutDependencyGraph(matches);
    expect(result.valid).toBe(false);
    expect(result.conflicts.length).toBeGreaterThanOrEqual(2);
  });
});
