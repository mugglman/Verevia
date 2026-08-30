import { describe, expect, it } from "vitest";
import { computeKnockoutFingerprint, KnockoutFingerprintInput } from "./knockout-fingerprint";
import { KnockoutScheduledMatch } from "./knockout-types";

const START = new Date("2026-12-05T09:00:00.000Z");

function baseMatch(overrides: Partial<KnockoutScheduledMatch> = {}): KnockoutScheduledMatch {
  return {
    key: "FINAL",
    round: "FINAL",
    home: { type: "TEAM", participantId: "p1" },
    away: { type: "TEAM", participantId: "p2" },
    venueId: "venue-1",
    startsAt: START,
    endsAt: new Date(START.getTime() + 10 * 60_000),
    ...overrides,
  };
}

function baseInput(overrides: Partial<KnockoutFingerprintInput> = {}): KnockoutFingerprintInput {
  return {
    tournament: { id: "t1", startsAt: START.toISOString(), endsAt: null, mode: "GROUPS_AND_KNOCKOUT" },
    entrants: [
      { seed: 1, source: { type: "TEAM", participantId: "p1" } },
      { seed: 2, source: { type: "TEAM", participantId: "p2" } },
    ],
    includeThirdPlace: false,
    venueIds: ["venue-1"],
    settings: { matchDurationMinutes: 10, changeoverMinutes: 2, minimumRestMinutes: 10, schedulingStartsAt: START.toISOString() },
    matches: [baseMatch()],
    ...overrides,
  };
}

describe("computeKnockoutFingerprint", () => {
  it("is deterministic for identical input", () => {
    expect(computeKnockoutFingerprint(baseInput())).toBe(computeKnockoutFingerprint(baseInput()));
  });

  it("is insensitive to venueIds/matches array ordering (semantically irrelevant order)", () => {
    const inputA = baseInput({
      venueIds: ["venue-1", "venue-2"],
      matches: [baseMatch({ key: "SF-1", round: "SEMIFINAL" }), baseMatch({ key: "SF-2", round: "SEMIFINAL", venueId: "venue-2" })],
    });
    const inputB = baseInput({
      venueIds: ["venue-2", "venue-1"],
      matches: [baseMatch({ key: "SF-2", round: "SEMIFINAL", venueId: "venue-2" }), baseMatch({ key: "SF-1", round: "SEMIFINAL" })],
    });
    expect(computeKnockoutFingerprint(inputA)).toBe(computeKnockoutFingerprint(inputB));
  });

  it("is sensitive to entrant (seed) order — order IS semantically significant for a bracket", () => {
    const inputA = baseInput({
      entrants: [
        { seed: 1, source: { type: "TEAM", participantId: "p1" } },
        { seed: 2, source: { type: "TEAM", participantId: "p2" } },
      ],
    });
    const inputB = baseInput({
      entrants: [
        { seed: 1, source: { type: "TEAM", participantId: "p2" } },
        { seed: 2, source: { type: "TEAM", participantId: "p1" } },
      ],
    });
    expect(computeKnockoutFingerprint(inputA)).not.toBe(computeKnockoutFingerprint(inputB));
  });

  it("changes when a slot source changes (e.g. GROUP_POSITION instead of TEAM)", () => {
    const before = computeKnockoutFingerprint(baseInput());
    const after = computeKnockoutFingerprint(
      baseInput({ entrants: [{ seed: 1, source: { type: "GROUP_POSITION", groupId: "g1", position: 1 } }, { seed: 2, source: { type: "TEAM", participantId: "p2" } }] }),
    );
    expect(after).not.toBe(before);
  });

  it("changes when includeThirdPlace changes", () => {
    const before = computeKnockoutFingerprint(baseInput({ includeThirdPlace: false }));
    const after = computeKnockoutFingerprint(baseInput({ includeThirdPlace: true }));
    expect(after).not.toBe(before);
  });

  it("changes when the venue selection changes", () => {
    const before = computeKnockoutFingerprint(baseInput());
    const after = computeKnockoutFingerprint(baseInput({ venueIds: ["venue-1", "venue-2"] }));
    expect(after).not.toBe(before);
  });

  it("changes when scheduling settings change", () => {
    const before = computeKnockoutFingerprint(baseInput());
    const after = computeKnockoutFingerprint(
      baseInput({ settings: { matchDurationMinutes: 15, changeoverMinutes: 2, minimumRestMinutes: 10, schedulingStartsAt: START.toISOString() } }),
    );
    expect(after).not.toBe(before);
  });

  it("changes when a match dependency changes (WINNER_OF_MATCH source key differs)", () => {
    const before = computeKnockoutFingerprint(baseInput({ matches: [baseMatch({ home: { type: "WINNER_OF_MATCH", matchKey: "SF-1" } })] }));
    const after = computeKnockoutFingerprint(baseInput({ matches: [baseMatch({ home: { type: "WINNER_OF_MATCH", matchKey: "SF-2" } })] }));
    expect(after).not.toBe(before);
  });

  it("changes when the generator version changes", () => {
    const before = computeKnockoutFingerprint(baseInput({ generatorVersion: "tournament-knockout-v1" }));
    const after = computeKnockoutFingerprint(baseInput({ generatorVersion: "tournament-knockout-v2" }));
    expect(after).not.toBe(before);
  });

  it("produces a 64-character lowercase hex SHA-256 digest", () => {
    expect(computeKnockoutFingerprint(baseInput())).toMatch(/^[0-9a-f]{64}$/);
  });
});
