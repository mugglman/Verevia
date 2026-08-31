import { describe, expect, it } from "vitest";
import {
  determineMatchOutcome,
  planSlotResolutions,
  type FinalizedMatchResult,
  type PendingResultSlot,
} from "./knockout-slot-resolution";

const baseMatch: FinalizedMatchResult = {
  status: "COMPLETED",
  homeScore: 3,
  awayScore: 1,
  homeParticipantId: "team-a",
  awayParticipantId: "team-b",
};

describe("determineMatchOutcome", () => {
  it("determines the home team as winner when homeScore > awayScore", () => {
    expect(determineMatchOutcome(baseMatch)).toEqual({ winnerParticipantId: "team-a", loserParticipantId: "team-b" });
  });

  it("determines the away team as winner when awayScore > homeScore", () => {
    expect(determineMatchOutcome({ ...baseMatch, homeScore: 1, awayScore: 4 })).toEqual({
      winnerParticipantId: "team-b",
      loserParticipantId: "team-a",
    });
  });

  it("returns null for a draw — no tiebreak/extra-time/penalty concept exists", () => {
    expect(determineMatchOutcome({ ...baseMatch, homeScore: 2, awayScore: 2 })).toBeNull();
  });

  it("returns null when the match is not COMPLETED", () => {
    expect(determineMatchOutcome({ ...baseMatch, status: "SCHEDULED" })).toBeNull();
    expect(determineMatchOutcome({ ...baseMatch, status: "POSTPONED" })).toBeNull();
    expect(determineMatchOutcome({ ...baseMatch, status: "CANCELLED" })).toBeNull();
  });

  it("returns null when either score is missing", () => {
    expect(determineMatchOutcome({ ...baseMatch, homeScore: null })).toBeNull();
    expect(determineMatchOutcome({ ...baseMatch, awayScore: null })).toBeNull();
  });

  it("returns null when either participant is not yet known", () => {
    expect(determineMatchOutcome({ ...baseMatch, homeParticipantId: null })).toBeNull();
    expect(determineMatchOutcome({ ...baseMatch, awayParticipantId: null })).toBeNull();
  });

  it("returns null when both participants are unknown", () => {
    expect(determineMatchOutcome({ ...baseMatch, homeParticipantId: null, awayParticipantId: null })).toBeNull();
  });
});

describe("planSlotResolutions", () => {
  const outcome = { winnerParticipantId: "team-a", loserParticipantId: "team-b" };

  it("resolves a WINNER_OF_MATCH slot to the winner", () => {
    const slots: PendingResultSlot[] = [{ slotId: "slot-1", targetMatchId: "final", side: "HOME", sourceType: "WINNER_OF_MATCH" }];
    expect(planSlotResolutions(outcome, slots)).toEqual([
      { slotId: "slot-1", targetMatchId: "final", side: "HOME", participantId: "team-a" },
    ]);
  });

  it("resolves a LOSER_OF_MATCH slot to the loser", () => {
    const slots: PendingResultSlot[] = [{ slotId: "slot-2", targetMatchId: "third-place", side: "AWAY", sourceType: "LOSER_OF_MATCH" }];
    expect(planSlotResolutions(outcome, slots)).toEqual([
      { slotId: "slot-2", targetMatchId: "third-place", side: "AWAY", participantId: "team-b" },
    ]);
  });

  it("resolves multiple dependent slots from a single outcome (e.g. Final home + Third-place home from the same semifinal)", () => {
    const slots: PendingResultSlot[] = [
      { slotId: "slot-final-home", targetMatchId: "final", side: "HOME", sourceType: "WINNER_OF_MATCH" },
      { slotId: "slot-third-home", targetMatchId: "third-place", side: "HOME", sourceType: "LOSER_OF_MATCH" },
    ];
    expect(planSlotResolutions(outcome, slots)).toEqual([
      { slotId: "slot-final-home", targetMatchId: "final", side: "HOME", participantId: "team-a" },
      { slotId: "slot-third-home", targetMatchId: "third-place", side: "HOME", participantId: "team-b" },
    ]);
  });

  it("returns an empty plan when there are no dependent slots", () => {
    expect(planSlotResolutions(outcome, [])).toEqual([]);
  });

  it("is deterministic — repeated calls with the same input produce the same plan", () => {
    const slots: PendingResultSlot[] = [{ slotId: "slot-1", targetMatchId: "final", side: "HOME", sourceType: "WINNER_OF_MATCH" }];
    expect(planSlotResolutions(outcome, slots)).toEqual(planSlotResolutions(outcome, slots));
  });
});
