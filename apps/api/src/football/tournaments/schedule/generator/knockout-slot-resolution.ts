/**
 * Pure domain logic for Phase 14: given a just-finalized knockout match's
 * result, determine its winner/loser (if unambiguous) and plan how that
 * outcome should be written into any dependent `TournamentMatchSlot`s.
 * DB-free, framework-free, deterministic — no Prisma, no transactions, no
 * side effects. See TournamentMatchSlotResolutionService for the
 * infrastructure layer that loads slots, applies this plan, and persists
 * it atomically. See docs/PHASE_14_TOURNAMENT_MATCH_SLOT_RESOLUTION_REPORT.md
 * and ADR 0011.
 */

export type MatchOutcomeStatus = "SCHEDULED" | "POSTPONED" | "CANCELLED" | "COMPLETED";

export interface FinalizedMatchResult {
  status: MatchOutcomeStatus;
  homeScore: number | null;
  awayScore: number | null;
  homeParticipantId: string | null;
  awayParticipantId: string | null;
}

export interface MatchOutcome {
  winnerParticipantId: string;
  loserParticipantId: string;
}

/**
 * A knockout match only has a determinable winner/loser when it is
 * COMPLETED, both scores are recorded, both participants are already known
 * (TEAM-sourced or previously resolved), and the scores actually differ —
 * no extra-time/penalty-shootout/tiebreak concept exists anywhere in this
 * codebase (see Phase 14 report §14), so a draw simply cannot be resolved
 * by this function. Callers must leave dependent slots pending rather than
 * guess.
 */
export function determineMatchOutcome(match: FinalizedMatchResult): MatchOutcome | null {
  if (match.status !== "COMPLETED") return null;
  if (match.homeScore == null || match.awayScore == null) return null;
  if (!match.homeParticipantId || !match.awayParticipantId) return null;
  if (match.homeScore === match.awayScore) return null;

  return match.homeScore > match.awayScore
    ? { winnerParticipantId: match.homeParticipantId, loserParticipantId: match.awayParticipantId }
    : { winnerParticipantId: match.awayParticipantId, loserParticipantId: match.homeParticipantId };
}

export type PendingSlotSourceType = "WINNER_OF_MATCH" | "LOSER_OF_MATCH";
export type MatchSlotSide = "HOME" | "AWAY";

/** A TournamentMatchSlot row still pending resolution, restricted to the fields this planner needs. */
export interface PendingResultSlot {
  slotId: string;
  targetMatchId: string;
  side: MatchSlotSide;
  sourceType: PendingSlotSourceType;
}

/** One concrete write to perform: fill `side` of `targetMatchId` with `participantId`, then remove `slotId`. */
export interface SlotResolution {
  slotId: string;
  targetMatchId: string;
  side: MatchSlotSide;
  participantId: string;
}

/**
 * Maps every pending slot that depends on this outcome to the participant
 * it should now receive. Pure — given the same outcome and slots, always
 * produces the same plan (order-preserving, no randomness). GROUP_POSITION
 * slots are never passed in here — they don't depend on a match result at
 * all (see ADR 0010), resolving them is out of Phase 14's scope (no
 * group-standings calculation exists).
 */
export function planSlotResolutions(outcome: MatchOutcome, pendingSlots: PendingResultSlot[]): SlotResolution[] {
  return pendingSlots.map((slot) => ({
    slotId: slot.slotId,
    targetMatchId: slot.targetMatchId,
    side: slot.side,
    participantId: slot.sourceType === "WINNER_OF_MATCH" ? outcome.winnerParticipantId : outcome.loserParticipantId,
  }));
}
