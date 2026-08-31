import { describe, expect, it } from "vitest";
import { computeGroupStandings } from "./group-standings";
import { planGroupPositionResolutions, resolveParticipantAtPosition, type PendingGroupPositionSlot } from "./group-position-resolution";

const A = "participant-a";
const B = "participant-b";
const C = "participant-c";
const D = "participant-d";

describe("resolveParticipantAtPosition", () => {
  it("resolves position 1 (the group winner) when unambiguous", () => {
    const standings = computeGroupStandings([A, B], [{ homeParticipantId: A, awayParticipantId: B, homeScore: 2, awayScore: 0 }]);
    expect(resolveParticipantAtPosition(standings, 1)).toBe(A);
  });

  it("resolves position 2 (the runner-up) when unambiguous", () => {
    const standings = computeGroupStandings([A, B], [{ homeParticipantId: A, awayParticipantId: B, homeScore: 2, awayScore: 0 }]);
    expect(resolveParticipantAtPosition(standings, 2)).toBe(B);
  });

  it("returns null for a position that doesn't exist", () => {
    const standings = computeGroupStandings([A, B], [{ homeParticipantId: A, awayParticipantId: B, homeScore: 2, awayScore: 0 }]);
    expect(resolveParticipantAtPosition(standings, 3)).toBeNull();
  });

  it("returns null when the requested position falls inside a genuine sporting tie — never guesses via the technical id tiebreak", () => {
    const standings = computeGroupStandings(
      [A, B, C, D],
      [
        { homeParticipantId: A, awayParticipantId: C, homeScore: 1, awayScore: 0 },
        { homeParticipantId: B, awayParticipantId: D, homeScore: 1, awayScore: 0 },
      ],
    );
    // A and B are fully tied for position 1 (and C/D for position 3/4, symmetrically).
    expect(resolveParticipantAtPosition(standings, 1)).toBeNull();
    expect(resolveParticipantAtPosition(standings, 2)).toBeNull();
  });
});

describe("planGroupPositionResolutions", () => {
  it("resolves a single group's position-1 slot", () => {
    const standings = computeGroupStandings([A, B], [{ homeParticipantId: A, awayParticipantId: B, homeScore: 2, awayScore: 0 }]);
    const slots: PendingGroupPositionSlot[] = [{ slotId: "slot-1", targetMatchId: "sf-1", side: "HOME", groupId: "group-a", groupPosition: 1 }];
    const plan = planGroupPositionResolutions(new Map([["group-a", standings]]), slots);
    expect(plan).toEqual([{ slotId: "slot-1", targetMatchId: "sf-1", side: "HOME", participantId: A }]);
  });

  it("resolves multiple positions of the same group independently", () => {
    const standings = computeGroupStandings([A, B], [{ homeParticipantId: A, awayParticipantId: B, homeScore: 2, awayScore: 0 }]);
    const slots: PendingGroupPositionSlot[] = [
      { slotId: "slot-1st", targetMatchId: "sf-1", side: "HOME", groupId: "group-a", groupPosition: 1 },
      { slotId: "slot-2nd", targetMatchId: "sf-2", side: "AWAY", groupId: "group-a", groupPosition: 2 },
    ];
    const plan = planGroupPositionResolutions(new Map([["group-a", standings]]), slots);
    expect(plan).toEqual([
      { slotId: "slot-1st", targetMatchId: "sf-1", side: "HOME", participantId: A },
      { slotId: "slot-2nd", targetMatchId: "sf-2", side: "AWAY", participantId: B },
    ]);
  });

  it("resolves crossed slots from two different groups feeding two different matches (A1 v B2, B1 v A2)", () => {
    const standingsA = computeGroupStandings([A, "a2"], [{ homeParticipantId: A, awayParticipantId: "a2", homeScore: 3, awayScore: 0 }]);
    const standingsB = computeGroupStandings([B, "b2"], [{ homeParticipantId: B, awayParticipantId: "b2", homeScore: 3, awayScore: 0 }]);
    const slots: PendingGroupPositionSlot[] = [
      { slotId: "slot-sf1-home", targetMatchId: "sf-1", side: "HOME", groupId: "group-a", groupPosition: 1 }, // A1
      { slotId: "slot-sf1-away", targetMatchId: "sf-1", side: "AWAY", groupId: "group-b", groupPosition: 2 }, // B2
      { slotId: "slot-sf2-home", targetMatchId: "sf-2", side: "HOME", groupId: "group-b", groupPosition: 1 }, // B1
      { slotId: "slot-sf2-away", targetMatchId: "sf-2", side: "AWAY", groupId: "group-a", groupPosition: 2 }, // A2
    ];
    const plan = planGroupPositionResolutions(
      new Map([
        ["group-a", standingsA],
        ["group-b", standingsB],
      ]),
      slots,
    );
    const byId = (id: string) => plan.find((p) => p.slotId === id);
    expect(byId("slot-sf1-home")?.participantId).toBe(A);
    expect(byId("slot-sf1-away")?.participantId).toBe("b2");
    expect(byId("slot-sf2-home")?.participantId).toBe(B);
    expect(byId("slot-sf2-away")?.participantId).toBe("a2");
  });

  it("omits a slot whose group isn't in the standings map (group not yet complete)", () => {
    const slots: PendingGroupPositionSlot[] = [{ slotId: "slot-1", targetMatchId: "sf-1", side: "HOME", groupId: "group-a", groupPosition: 1 }];
    const plan = planGroupPositionResolutions(new Map(), slots);
    expect(plan).toEqual([]);
  });

  it("omits a slot whose requested position is a genuine sporting tie", () => {
    // A and B both beat a different opponent 1-0 -> fully identical stats, tied for 1st.
    const standings = computeGroupStandings(
      [A, B, C, D],
      [
        { homeParticipantId: A, awayParticipantId: C, homeScore: 1, awayScore: 0 },
        { homeParticipantId: B, awayParticipantId: D, homeScore: 1, awayScore: 0 },
      ],
    );
    const slots: PendingGroupPositionSlot[] = [{ slotId: "slot-1", targetMatchId: "sf-1", side: "HOME", groupId: "group-a", groupPosition: 1 }];
    const plan = planGroupPositionResolutions(new Map([["group-a", standings]]), slots);
    expect(plan).toEqual([]);
  });

  it("returns an empty plan for no pending slots", () => {
    expect(planGroupPositionResolutions(new Map(), [])).toEqual([]);
  });

  it("is deterministic — repeated calls with the same input produce the same plan", () => {
    const standings = computeGroupStandings([A, B], [{ homeParticipantId: A, awayParticipantId: B, homeScore: 2, awayScore: 0 }]);
    const slots: PendingGroupPositionSlot[] = [{ slotId: "slot-1", targetMatchId: "sf-1", side: "HOME", groupId: "group-a", groupPosition: 1 }];
    const map = new Map([["group-a", standings]]);
    expect(planGroupPositionResolutions(map, slots)).toEqual(planGroupPositionResolutions(map, slots));
  });
});
