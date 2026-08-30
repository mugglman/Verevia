import { ScheduleConflict } from "./types";

/**
 * Where a knockout match's home/away participant comes from. `TEAM` is the
 * only source ever resolved to a concrete participant within Phase 13 (no
 * live-result processing, no standings/placement calculation — see work
 * order section 28) — `GROUP_POSITION`, `WINNER_OF_MATCH`, and
 * `LOSER_OF_MATCH` are always "pending" for the lifetime of this phase.
 * See ADR 0010 for how a pending source is persisted.
 */
export type SlotSource =
  | { type: "TEAM"; participantId: string }
  | { type: "GROUP_POSITION"; groupId: string; position: number }
  | { type: "WINNER_OF_MATCH"; matchKey: string }
  | { type: "LOSER_OF_MATCH"; matchKey: string };

export function isPendingSource(source: SlotSource): source is Extract<SlotSource, { type: "GROUP_POSITION" | "WINNER_OF_MATCH" | "LOSER_OF_MATCH" }> {
  return source.type !== "TEAM";
}

export type KnockoutRound = "ROUND_OF_16" | "QUARTERFINAL" | "SEMIFINAL" | "THIRD_PLACE" | "FINAL";

/** A single knockout fixture, not yet scheduled to a time/venue. */
export interface KnockoutMatchConfig {
  /** Stable, deterministic key — e.g. "QF-1", "SF-1", "THIRD-PLACE", "FINAL". Never a random DB ID. */
  key: string;
  round: KnockoutRound;
  home: SlotSource;
  away: SlotSource;
}

/** Bracket matches in generation order — see `generateKnockoutBracket`. Round order IS dependency order (a match only ever depends on a strictly earlier round). */
export interface KnockoutBracket {
  matches: KnockoutMatchConfig[];
}

export interface KnockoutScheduledMatch extends KnockoutMatchConfig {
  venueId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface KnockoutScheduleResult {
  valid: boolean;
  matches: KnockoutScheduledMatch[];
  conflicts: ScheduleConflict[];
}
