import { describe, expect, it } from "vitest";
import { computeScheduleFingerprint, FingerprintInput } from "./schedule-fingerprint";
import { ScheduledMatch } from "./types";

const START = new Date("2026-12-05T09:00:00.000Z");

function baseMatch(overrides: Partial<ScheduledMatch> = {}): ScheduledMatch {
  return {
    groupId: "g1",
    round: 0,
    homeParticipantId: "p1",
    awayParticipantId: "p2",
    venueId: "venue-1",
    startsAt: START,
    endsAt: new Date(START.getTime() + 10 * 60_000),
    ...overrides,
  };
}

function baseInput(overrides: Partial<FingerprintInput> = {}): FingerprintInput {
  return {
    tournament: { id: "t1", startsAt: START.toISOString(), endsAt: null, mode: "GROUPS" },
    participants: [
      { id: "p1", groupId: "g1" },
      { id: "p2", groupId: "g1" },
    ],
    groups: [{ id: "g1", name: "Gruppe A", displayOrder: 0 }],
    venueIds: ["venue-1"],
    settings: { matchDurationMinutes: 10, changeoverMinutes: 2, minimumRestMinutes: 10, schedulingStartsAt: START.toISOString() },
    matches: [baseMatch()],
    ...overrides,
  };
}

describe("computeScheduleFingerprint", () => {
  it("is deterministic for identical input", () => {
    const input = baseInput();
    expect(computeScheduleFingerprint(input)).toBe(computeScheduleFingerprint(baseInput()));
  });

  it("is insensitive to array ordering (participants/groups/venues/matches)", () => {
    const inputA = baseInput({
      participants: [
        { id: "p1", groupId: "g1" },
        { id: "p2", groupId: "g1" },
      ],
      matches: [baseMatch({ homeParticipantId: "p1", awayParticipantId: "p2" }), baseMatch({ round: 1, homeParticipantId: "p2", awayParticipantId: "p1" })],
    });
    const inputB = baseInput({
      participants: [
        { id: "p2", groupId: "g1" },
        { id: "p1", groupId: "g1" },
      ],
      matches: [baseMatch({ round: 1, homeParticipantId: "p2", awayParticipantId: "p1" }), baseMatch({ homeParticipantId: "p1", awayParticipantId: "p2" })],
    });
    expect(computeScheduleFingerprint(inputA)).toBe(computeScheduleFingerprint(inputB));
  });

  it("changes when a participant is added", () => {
    const before = computeScheduleFingerprint(baseInput());
    const after = computeScheduleFingerprint(
      baseInput({ participants: [{ id: "p1", groupId: "g1" }, { id: "p2", groupId: "g1" }, { id: "p3", groupId: "g1" }] }),
    );
    expect(after).not.toBe(before);
  });

  it("changes when a participant's group changes", () => {
    const before = computeScheduleFingerprint(baseInput());
    const after = computeScheduleFingerprint(
      baseInput({ participants: [{ id: "p1", groupId: "g2" }, { id: "p2", groupId: "g1" }] }),
    );
    expect(after).not.toBe(before);
  });

  it("changes when the venue selection changes", () => {
    const before = computeScheduleFingerprint(baseInput());
    const after = computeScheduleFingerprint(baseInput({ venueIds: ["venue-1", "venue-2"] }));
    expect(after).not.toBe(before);
  });

  it("changes when settings change", () => {
    const before = computeScheduleFingerprint(baseInput());
    const after = computeScheduleFingerprint(
      baseInput({ settings: { matchDurationMinutes: 15, changeoverMinutes: 2, minimumRestMinutes: 10, schedulingStartsAt: START.toISOString() } }),
    );
    expect(after).not.toBe(before);
  });

  it("changes when the tournament time changes", () => {
    const before = computeScheduleFingerprint(baseInput());
    const after = computeScheduleFingerprint(
      baseInput({ tournament: { id: "t1", startsAt: new Date(START.getTime() + 60_000).toISOString(), endsAt: null, mode: "GROUPS" } }),
    );
    expect(after).not.toBe(before);
  });

  it("changes when the generated matches themselves change", () => {
    const before = computeScheduleFingerprint(baseInput());
    const after = computeScheduleFingerprint(baseInput({ matches: [baseMatch({ venueId: "venue-2" })] }));
    expect(after).not.toBe(before);
  });

  it("produces a 64-character lowercase hex SHA-256 digest", () => {
    const fingerprint = computeScheduleFingerprint(baseInput());
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
