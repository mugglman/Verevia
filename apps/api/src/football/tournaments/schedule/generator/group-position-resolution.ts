/**
 * Pure domain logic for Phase 16: given a group's final standings, decide
 * which pending GROUP_POSITION `TournamentMatchSlot`s can be resolved to a
 * concrete participant. DB-free, framework-free, deterministic. See
 * knockout-slot-resolution.ts for the WinnerOfMatch/LoserOfMatch analog —
 * this module deliberately mirrors its shape (same SlotResolution output)
 * so the infrastructure layer (MatchesService) can apply both kinds of
 * resolution through one shared code path.
 */
import type { GroupStandingsRow } from "./group-standings";
import type { MatchSlotSide, SlotResolution } from "./knockout-slot-resolution";

export interface PendingGroupPositionSlot {
  slotId: string;
  targetMatchId: string;
  side: MatchSlotSide;
  groupId: string;
  /** 1-based — "1" means the group's winner. */
  groupPosition: number;
}

/**
 * A position is only sportingly resolvable when exactly one participant
 * occupies it — i.e. it isn't part of a tie block (see
 * GroupStandingsRow.tiedRankGroupSize). Returns null both when the
 * position doesn't exist (fewer participants than requested) and when it
 * exists but is genuinely tied — callers must not distinguish these to
 * "guess" a winner either way.
 */
export function resolveParticipantAtPosition(standings: GroupStandingsRow[], position: number): string | null {
  const row = standings.find((r) => r.rank === position);
  if (!row || row.tiedRankGroupSize > 1) return null;
  return row.participantId;
}

/**
 * Plans resolutions for every pending slot whose group is present in
 * `standingsByGroupId` (callers only pass groups that are actually
 * complete — see MatchesService.resolveGroupPositionSlots) AND whose
 * requested position is sportingly unambiguous. Slots for a genuine tie
 * are silently omitted from the plan — never resolved via the technical
 * participantId tiebreak baked into GroupStandingsRow.rank.
 */
export function planGroupPositionResolutions(
  standingsByGroupId: Map<string, GroupStandingsRow[]>,
  pendingSlots: PendingGroupPositionSlot[],
): SlotResolution[] {
  const resolutions: SlotResolution[] = [];
  for (const slot of pendingSlots) {
    const standings = standingsByGroupId.get(slot.groupId);
    if (!standings) continue;
    const participantId = resolveParticipantAtPosition(standings, slot.groupPosition);
    if (!participantId) continue;
    resolutions.push({ slotId: slot.slotId, targetMatchId: slot.targetMatchId, side: slot.side, participantId });
  }
  return resolutions;
}
