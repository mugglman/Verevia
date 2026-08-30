import { KnockoutBracket, KnockoutMatchConfig, KnockoutRound, SlotSource } from "./knockout-types";

export const KNOCKOUT_GENERATOR_VERSION = "tournament-knockout-v1";

/** How many matches a round produces → its label. Bounded by SCHEDULE_GENERATION_LIMITS.maxKnockoutEntrants (≤16), so this table is always sufficient — see limits.ts. */
const ROUND_LABEL_BY_MATCH_COUNT: Record<number, KnockoutRound> = {
  1: "FINAL",
  2: "SEMIFINAL",
  4: "QUARTERFINAL",
  8: "ROUND_OF_16",
};

const ROUND_KEY_PREFIX: Record<KnockoutRound, string> = {
  FINAL: "FINAL",
  SEMIFINAL: "SF",
  QUARTERFINAL: "QF",
  ROUND_OF_16: "R16",
  THIRD_PLACE: "THIRD-PLACE",
};

/**
 * Standard recursive tournament-bracket seed order (the well-known
 * "1v8, 4v5, 2v7, 3v6" pattern for 8 entrants — work order section 7).
 * Deterministic and side-effect-free: same `size` always produces the same
 * order. `size` must be a power of two.
 */
export function computeSeedOrder(size: number): number[] {
  if (size <= 1) return [1];
  const half = computeSeedOrder(size / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed, size + 1 - seed);
  }
  return result;
}

/** Smallest power of two >= n (n >= 1). */
function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/**
 * Generates a complete, deterministic knockout bracket from an ordered
 * list of entrant sources (seed 1 first) — work order sections 5–8. Entrant
 * sources are opaque to this function: they may be direct `TEAM` sources,
 * `GROUP_POSITION` sources, or (in principle) already-nested references —
 * the bracket generator only cares about ORDER, not what a source
 * ultimately resolves to. If `entrants.length` isn't a power of two, the
 * highest seeds receive a BYE (standard tournament convention) and advance
 * to the next round without a match being created for them — see
 * `isPendingSource`/ADR 0010 for why this doesn't lose information even
 * though no FootballMatch row is ever created for a BYE.
 *
 * Pure and deterministic: identical `entrants` order always produces an
 * identical bracket (same keys, same structure).
 */
export function generateKnockoutBracket(entrants: readonly SlotSource[], includeThirdPlace: boolean): KnockoutBracket {
  const bracketSize = nextPowerOfTwo(entrants.length);
  const seedOrder = computeSeedOrder(bracketSize);

  // Slot i (0-based) of the bracket holds entrant `seedOrder[i]` — or a BYE
  // if that seed number exceeds the actual entrant count.
  let currentRoundSlots: (SlotSource | null)[] = seedOrder.map((seed) => entrants[seed - 1] ?? null);

  const matches: KnockoutMatchConfig[] = [];

  while (currentRoundSlots.length > 1) {
    const matchCountThisRound = currentRoundSlots.length / 2;
    const round = ROUND_LABEL_BY_MATCH_COUNT[matchCountThisRound];
    if (!round) {
      // Unreachable given the entrant-count guardrail in the service layer
      // (limits.ts caps entrants well below what would produce this), but
      // fail loudly rather than silently mislabeling a round.
      throw new Error(`No round label defined for a round producing ${matchCountThisRound} matches.`);
    }

    const nextRoundSlots: SlotSource[] = [];
    const roundMatchKeys: string[] = [];
    let matchIndex = 1;

    for (let i = 0; i < currentRoundSlots.length; i += 2) {
      const homeVal = currentRoundSlots[i];
      const awayVal = currentRoundSlots[i + 1];

      if (homeVal && awayVal) {
        const key = round === "FINAL" ? "FINAL" : `${ROUND_KEY_PREFIX[round]}-${matchIndex}`;
        matches.push({ key, round, home: homeVal, away: awayVal });
        nextRoundSlots.push({ type: "WINNER_OF_MATCH", matchKey: key });
        roundMatchKeys.push(key);
        matchIndex++;
      } else {
        // BYE: exactly one side present (guaranteed by the caller-enforced
        // minimum-entrant-count precondition — see TournamentKnockoutService)
        // — the present entrant advances directly, no match, no key.
        nextRoundSlots.push((homeVal ?? awayVal)!);
      }
    }

    // Inserted right after the semifinal round is generated, so it reads
    // "SF-1, SF-2, THIRD-PLACE, FINAL" — order has no effect on scheduling
    // correctness (both THIRD-PLACE and FINAL depend only on the
    // semifinals, never on each other), only on presentation.
    if (round === "SEMIFINAL" && includeThirdPlace && roundMatchKeys.length === 2) {
      matches.push({
        key: "THIRD-PLACE",
        round: "THIRD_PLACE",
        home: { type: "LOSER_OF_MATCH", matchKey: roundMatchKeys[0]! },
        away: { type: "LOSER_OF_MATCH", matchKey: roundMatchKeys[1]! },
      });
    }

    currentRoundSlots = nextRoundSlots;
  }

  return { matches };
}
