import { GroupInput, ParticipantInput, Fixture } from "./types";

/**
 * Deterministic round-robin fixture generation via the "circle method"
 * (Berger-system-like): fix the first participant, rotate the rest by one
 * position each round. For an odd participant count, a virtual BYE is
 * added to make the count even — a BYE never produces a Fixture. Home/away
 * alternates by round parity within a pairing (cheap fairness, no
 * optimization — see work order section 18).
 *
 * Pure and side-effect-free: same participant list (same order) always
 * produces the exact same fixture list. Participant ORDER is the only
 * input that determines home/away/round assignment, so callers must sort
 * participants into a stable order before calling this — see
 * `sortParticipantsForGrouping` below.
 */
export function generateRoundRobinFixtures(groupId: string, participantIds: readonly string[]): Fixture[] {
  const BYE = null;
  let ring: (string | null)[] = [...participantIds];
  if (ring.length % 2 !== 0) {
    ring.push(BYE);
  }
  const n = ring.length;
  if (n < 2) {
    return [];
  }
  const rounds = n - 1;
  const fixtures: Fixture[] = [];

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      // `i < n/2` and `n-1-i < n` for all i in range, so both accesses are
      // in-bounds at runtime — `?? BYE` only satisfies noUncheckedIndexedAccess.
      const a = ring[i] ?? BYE;
      const b = ring[n - 1 - i] ?? BYE;
      if (a !== BYE && b !== BYE) {
        const home = round % 2 === 0 ? a : b;
        const away = round % 2 === 0 ? b : a;
        fixtures.push({ groupId, round, homeParticipantId: home, awayParticipantId: away });
      }
    }
    // Rotate: keep position 0 fixed, move the last element to position 1,
    // shift everything else one position to the right.
    const fixed = ring[0] ?? BYE; // ring always has >= 2 elements here (n >= 2, checked above)
    const rest = ring.slice(1);
    const last = rest.pop();
    if (last !== undefined) {
      rest.unshift(last);
    }
    ring = [fixed, ...rest];
  }

  return fixtures;
}

/**
 * Stable participant ordering (work order section 12): seed ascending
 * (nulls last), then createdAt ascending, then id ascending as a final
 * deterministic tie-breaker. This order alone determines the generated
 * fixtures/rounds — same input order always yields the same output.
 */
export function sortParticipantsForGrouping<T extends Pick<ParticipantInput, "id" | "seed" | "createdAt">>(
  participants: readonly T[],
): T[] {
  return [...participants].sort((a, b) => {
    if (a.seed !== b.seed) {
      if (a.seed == null) return 1;
      if (b.seed == null) return -1;
      return a.seed - b.seed;
    }
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

/** Stable group ordering: displayOrder ascending, then name, then id. */
export function sortGroups<T extends Pick<GroupInput, "id" | "name" | "displayOrder">>(groups: readonly T[]): T[] {
  return [...groups].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    const nameDiff = a.name.localeCompare(b.name);
    if (nameDiff !== 0) return nameDiff;
    return a.id.localeCompare(b.id);
  });
}
