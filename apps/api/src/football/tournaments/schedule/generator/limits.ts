/**
 * Central, documented defaults and guardrail limits for the schedule
 * generator (Phase 12, sections 10/57) — deliberately not hardcoded
 * inline at each call site, and deliberately not a persisted DB config
 * (see docs/PHASE_12_TOURNAMENT_SCHEDULE_GENERATOR_REPORT.md, "Domain
 * model decision").
 */

/** Sensible starting values for a typical youth-football tournament slot. */
export const SCHEDULE_DEFAULTS = {
  matchDurationMinutes: 10,
  changeoverMinutes: 2,
  minimumRestMinutes: 10,
} as const;

/** Plausible bounds on user-supplied settings — reject anything outside these before generating. */
export const SCHEDULE_SETTINGS_LIMITS = {
  minMatchDurationMinutes: 1,
  maxMatchDurationMinutes: 180,
  minChangeoverMinutes: 0,
  maxChangeoverMinutes: 60,
  minMinimumRestMinutes: 0,
  maxMinimumRestMinutes: 240,
} as const;

/**
 * DoS/misuse guardrails on the generator itself — a realistic youth
 * tournament (see seed) is far below these; they exist to bound worst-case
 * CPU/memory of a single preview/commit request, not to model a real
 * constraint. Exceeding one is a precondition rejection (HTTP 400), not a
 * scheduling conflict.
 */
export const SCHEDULE_GENERATION_LIMITS = {
  maxParticipantsPerGroup: 32,
  maxGroups: 16,
  maxVenues: 12,
  maxGeneratedMatches: 500,
  /** Hard cap on how many time slots the scheduler will ever consider before giving up on a fixture. */
  maxSlotSearchIndex: 2000,
  /**
   * Phase 13: max entrants for an automatically generated knockout bracket.
   * 16 = the largest bracket size explicitly required by the work order
   * (Round of 16 / "Achtelfinale") — the bracket generator itself is fully
   * generic for any power-of-two size, this limit exists purely as a
   * guardrail, not because larger sizes need special-casing.
   */
  maxKnockoutEntrants: 16,
} as const;

export const GENERATOR_VERSION = "tournament-round-robin-v1";
