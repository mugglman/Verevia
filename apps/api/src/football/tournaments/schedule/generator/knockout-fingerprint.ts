import { createHash } from "node:crypto";
import { KNOCKOUT_GENERATOR_VERSION } from "./knockout-bracket.generator";
import { KnockoutScheduledMatch, SlotSource } from "./knockout-types";

export interface KnockoutFingerprintTournamentInput {
  id: string;
  startsAt: string;
  endsAt: string | null;
  mode: string | null;
}

export interface KnockoutFingerprintEntrant {
  /** 1-based seed position — order matters here (unlike round-robin's participant set), so NOT sorted before hashing. */
  seed: number;
  source: SlotSource;
}

export interface KnockoutFingerprintInput {
  tournament: KnockoutFingerprintTournamentInput;
  entrants: readonly KnockoutFingerprintEntrant[];
  includeThirdPlace: boolean;
  venueIds: readonly string[];
  settings: {
    matchDurationMinutes: number;
    changeoverMinutes: number;
    minimumRestMinutes: number;
    schedulingStartsAt: string;
  };
  matches: readonly KnockoutScheduledMatch[];
  /** Defaults to KNOCKOUT_GENERATOR_VERSION — override only exists to make version-sensitivity cleanly unit-testable. */
  generatorVersion?: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(record[key]);
    }
    return result;
  }
  return value;
}

/**
 * Stable SHA-256 fingerprint over every input that determines a generated
 * knockout bracket (work order section 12) — tournament timing/mode, the
 * ordered entrant list (seed order is semantically significant here, unlike
 * round-robin's participant set — NOT sorted before hashing), whether a
 * third-place match is included, selected venues, scheduling settings, the
 * generator version, and the generated+scheduled matches themselves
 * (including their dependency structure via `home`/`away` slot sources).
 * `venueIds` and `matches` ARE sorted (their relative order carries no
 * semantic meaning) so incidental ordering never changes the fingerprint.
 * Same properties as the Phase 12 fingerprint (canonical, deterministic,
 * change-sensitive) — see `schedule-fingerprint.ts`.
 */
export function computeKnockoutFingerprint(input: KnockoutFingerprintInput): string {
  const sortedVenueIds = [...input.venueIds].sort((a, b) => a.localeCompare(b));

  const sortedMatches = [...input.matches]
    .map((m) => ({
      key: m.key,
      round: m.round,
      home: m.home,
      away: m.away,
      venueId: m.venueId,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const canonical = canonicalize({
    generatorVersion: input.generatorVersion ?? KNOCKOUT_GENERATOR_VERSION,
    tournament: input.tournament,
    entrants: input.entrants, // order preserved deliberately — seed 1 vs seed 2 is not the same bracket as swapped
    includeThirdPlace: input.includeThirdPlace,
    venueIds: sortedVenueIds,
    settings: input.settings,
    matches: sortedMatches,
  });

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
