import { describe, expect, it } from "vitest";
import { generateRoundRobinFixtures, sortGroups, sortParticipantsForGrouping } from "./round-robin.generator";

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

function pairKey(homeParticipantId: string, awayParticipantId: string): string {
  return [homeParticipantId, awayParticipantId].sort().join("-");
}

describe("generateRoundRobinFixtures", () => {
  it("2 participants → 1 match", () => {
    const fixtures = generateRoundRobinFixtures("g1", ids(2));
    expect(fixtures).toHaveLength(1);
  });

  it("3 participants → 3 matches (BYE handled internally, produces no fixture)", () => {
    const fixtures = generateRoundRobinFixtures("g1", ids(3));
    expect(fixtures).toHaveLength(3);
    const pairs = new Set(fixtures.map((f) => pairKey(f.homeParticipantId, f.awayParticipantId)));
    expect(pairs.size).toBe(3);
  });

  it("4 participants → 6 matches", () => {
    expect(generateRoundRobinFixtures("g1", ids(4))).toHaveLength(6);
  });

  it("5 participants → 10 matches", () => {
    expect(generateRoundRobinFixtures("g1", ids(5))).toHaveLength(10);
  });

  it("6 participants → 15 matches", () => {
    expect(generateRoundRobinFixtures("g1", ids(6))).toHaveLength(15);
  });

  it("every pair plays exactly once, no self-matches, for n=4..8", () => {
    for (let n = 4; n <= 8; n++) {
      const participantIds = ids(n);
      const fixtures = generateRoundRobinFixtures("g1", participantIds);
      const expectedPairCount = (n * (n - 1)) / 2;
      expect(fixtures).toHaveLength(expectedPairCount);

      const seenPairs = new Set<string>();
      for (const fixture of fixtures) {
        expect(fixture.homeParticipantId).not.toBe(fixture.awayParticipantId);
        const key = pairKey(fixture.homeParticipantId, fixture.awayParticipantId);
        expect(seenPairs.has(key)).toBe(false);
        seenPairs.add(key);
      }
      // Every possible pair among the n participants was generated exactly once.
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          expect(seenPairs.has(pairKey(participantIds[i]!, participantIds[j]!))).toBe(true);
        }
      }
    }
  });

  it("no group has cross-group pairings — fixtures always carry the requested groupId", () => {
    const fixtures = generateRoundRobinFixtures("group-a", ids(4));
    expect(fixtures.every((f) => f.groupId === "group-a")).toBe(true);
  });

  it("is deterministic: identical input order produces identical output", () => {
    const first = generateRoundRobinFixtures("g1", ids(5));
    const second = generateRoundRobinFixtures("g1", ids(5));
    expect(second).toEqual(first);
  });

  it("0 or 1 participant produces no fixtures", () => {
    expect(generateRoundRobinFixtures("g1", [])).toHaveLength(0);
    expect(generateRoundRobinFixtures("g1", ["p1"])).toHaveLength(0);
  });

  it("home/away alternates across rounds within a round-robin (not always the same side)", () => {
    const fixtures = generateRoundRobinFixtures("g1", ids(4));
    const homeCounts = new Map<string, number>();
    for (const f of fixtures) {
      homeCounts.set(f.homeParticipantId, (homeCounts.get(f.homeParticipantId) ?? 0) + 1);
    }
    // With 4 participants (6 matches, 3 each), no single participant should be
    // home in ALL of their matches — cheap fairness check, not a strict split.
    for (const count of homeCounts.values()) {
      expect(count).toBeLessThan(3);
    }
  });
});

describe("sortParticipantsForGrouping", () => {
  it("orders by seed ascending, nulls last, then createdAt, then id", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const participants = [
      { id: "b", seed: null, createdAt: base },
      { id: "a", seed: 2, createdAt: base },
      { id: "c", seed: 1, createdAt: base },
      { id: "d", seed: null, createdAt: new Date(base.getTime() - 1000) },
    ];
    const sorted = sortParticipantsForGrouping(participants);
    expect(sorted.map((p) => p.id)).toEqual(["c", "a", "d", "b"]);
  });
});

describe("sortGroups", () => {
  it("orders by displayOrder ascending, then name, then id", () => {
    const groups = [
      { id: "g2", name: "Gruppe B", displayOrder: 1 },
      { id: "g1", name: "Gruppe A", displayOrder: 0 },
    ];
    expect(sortGroups(groups).map((g) => g.id)).toEqual(["g1", "g2"]);
  });
});
