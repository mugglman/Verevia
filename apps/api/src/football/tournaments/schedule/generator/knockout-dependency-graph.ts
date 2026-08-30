import { KnockoutMatchConfig } from "./knockout-types";
import { ScheduleConflict } from "./types";

export interface DependencyValidationResult {
  valid: boolean;
  conflicts: ScheduleConflict[];
  /** Match key → round index (0-based, source rounds always < dependent rounds), only present when valid. */
  roundIndexByKey?: Map<string, number>;
}

/**
 * Independently validates a knockout match set's dependency graph — pure,
 * takes no assumption about how the matches were produced, so it can be fed
 * deliberately-broken hand-built input in tests (work order section 10):
 * self-reference, references to unknown matches, cycles, and a dependency
 * that doesn't actually move to a later round. Builds a directed graph from
 * every `WINNER_OF_MATCH`/`LOSER_OF_MATCH` source (source match → this
 * match) and checks:
 *
 * - every referenced match key exists in the given set
 * - no match references itself
 * - the graph is acyclic (DFS-based cycle detection)
 * - a dependency's source match doesn't come at or after the dependent
 *   match in round order (round order here = position in the input array,
 *   which `generateKnockoutBracket` always produces correctly — this check
 *   catches a hand-built/edited bracket that violates it)
 */
export function validateKnockoutDependencyGraph(matches: readonly KnockoutMatchConfig[]): DependencyValidationResult {
  const conflicts: ScheduleConflict[] = [];
  const matchByKey = new Map(matches.map((m, index) => [m.key, { match: m, index }]));

  const edges = new Map<string, string[]>(); // sourceKey -> [dependentKeys]
  for (const match of matches) {
    for (const source of [match.home, match.away]) {
      if (source.type !== "WINNER_OF_MATCH" && source.type !== "LOSER_OF_MATCH") continue;

      if (source.matchKey === match.key) {
        conflicts.push({
          code: "SELF_REFERENCE",
          message: `Das Spiel "${match.key}" verweist auf sich selbst als Vorgängerspiel.`,
        });
        continue;
      }

      const sourceEntry = matchByKey.get(source.matchKey);
      if (!sourceEntry) {
        conflicts.push({
          code: "UNKNOWN_MATCH_REFERENCE",
          message: `"${match.key}" verweist auf ein unbekanntes Vorgängerspiel ("${source.matchKey}").`,
        });
        continue;
      }

      const dependentEntry = matchByKey.get(match.key)!;
      if (sourceEntry.index >= dependentEntry.index) {
        conflicts.push({
          code: "DEPENDENCY_ROUND_ORDER",
          message: `"${match.key}" müsste nach seinem Vorgängerspiel "${source.matchKey}" liegen, tut es aber nicht.`,
        });
      }

      const list = edges.get(source.matchKey) ?? [];
      list.push(match.key);
      edges.set(source.matchKey, list);
    }
  }

  // DFS cycle detection over the (possibly partially invalid) edge set —
  // still meaningful even alongside the errors collected above.
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>(matches.map((m) => [m.key, WHITE]));
  let hasCycle = false;

  function visit(key: string) {
    if (hasCycle) return;
    color.set(key, GRAY);
    for (const next of edges.get(key) ?? []) {
      const state = color.get(next);
      if (state === GRAY) {
        hasCycle = true;
        return;
      }
      if (state === WHITE) visit(next);
    }
    color.set(key, BLACK);
  }
  for (const match of matches) {
    if (color.get(match.key) === WHITE) visit(match.key);
  }
  if (hasCycle) {
    conflicts.push({
      code: "DEPENDENCY_CYCLE",
      message: "Die Abhängigkeiten zwischen den Turnierspielen enthalten einen Zyklus — das ist strukturell nicht auflösbar.",
    });
  }

  if (conflicts.length > 0) {
    return { valid: false, conflicts };
  }

  const roundIndexByKey = new Map(matches.map((m, index) => [m.key, index]));
  return { valid: true, conflicts: [], roundIndexByKey };
}
