/**
 * Shared pure types for the tournament schedule generator (Phase 12).
 * Everything in `./generator` is deliberately framework-/DB-free (no
 * NestJS DI, no Prisma) so it can be unit-tested directly — see section
 * 40 of the work order ("Generator als Domain Service", nicht im
 * Controller/Prisma-Service). `TournamentScheduleService` is the only
 * place that bridges this pure domain to the database.
 */

export interface ParticipantInput {
  id: string;
  groupId: string | null;
  /** Manual seeding, ascending, nulls last — primary ordering key. */
  seed: number | null;
  /** Stable tie-breaker when seed is equal/absent. */
  createdAt: Date;
  /** Team name or external name — used only to render human-readable conflict messages. */
  displayName: string;
}

export interface GroupInput {
  id: string;
  name: string;
  displayOrder: number;
}

/** A single group-stage pairing, not yet scheduled to a time/venue. */
export interface Fixture {
  groupId: string;
  /** 0-based round index within this group (circle-method round). */
  round: number;
  homeParticipantId: string;
  awayParticipantId: string;
}

export interface ScheduleSettings {
  matchDurationMinutes: number;
  changeoverMinutes: number;
  minimumRestMinutes: number;
  /** Selected TournamentVenue venue IDs, in the order they should be filled. */
  venueIds: string[];
  /** Resolved scheduling start (tournament.startsAt, or an explicit override). */
  schedulingStartsAt: Date;
  /** Hard ceiling — no match may end after this instant. Null if the tournament has no endsAt. */
  tournamentEndsAt: Date | null;
}

/** A fixture successfully assigned to a concrete time slot and venue. */
export interface ScheduledMatch extends Fixture {
  venueId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ScheduleConflict {
  /** Machine-readable reason, for tests/logging — never shown raw in the UI. */
  code:
    | "UNSUPPORTED_MODE"
    | "NO_VENUES"
    | "PARTICIPANT_WITHOUT_GROUP"
    | "GROUP_TOO_SMALL"
    | "UNPLACEABLE_FIXTURE"
    | "PARTICIPANT_OVERLAP"
    | "VENUE_OVERLAP"
    | "REST_VIOLATION"
    | "TOURNAMENT_END_EXCEEDED"
    | "INVALID_MATCH"
    // Phase 13 (knockout) additions:
    | "SELF_REFERENCE"
    | "UNKNOWN_MATCH_REFERENCE"
    | "DEPENDENCY_CYCLE"
    | "DEPENDENCY_ROUND_ORDER"
    | "DUPLICATE_ENTRANT"
    | "TOO_FEW_ENTRANTS"
    | "THIRD_PLACE_UNSUPPORTED";
  /** German, human-readable — safe to render directly in the UI (see section 35). */
  message: string;
}

export interface ScheduleResult {
  valid: boolean;
  matches: ScheduledMatch[];
  conflicts: ScheduleConflict[];
}
