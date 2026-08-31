/**
 * Pure domain logic for Phase 16: computes a group's table from its
 * completed matches. DB-free, framework-free, deterministic — no Prisma,
 * no transactions, no side effects. Standings are always DERIVED data,
 * never persisted (see docs/PHASE_16_TOURNAMENT_GROUP_STANDINGS_REPORT.md
 * and ADR 0012) — this function is the single source of truth for the
 * calculation, used identically by the read path (API group listing) and
 * the write path (GROUP_POSITION slot resolution in
 * group-position-resolution.ts), so both can never disagree.
 */

export interface GroupMatchResult {
  homeParticipantId: string;
  awayParticipantId: string;
  homeScore: number;
  awayScore: number;
}

export interface GroupStandingsRow {
  participantId: string;
  /** 1-based position in the fully deterministic display order (see module doc comment on tiedRankGroupSize for why this is NOT always a sporting fact). */
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /**
   * How many rows share this row's exact (points, goalDifference,
   * goalsFor) triple. 1 means this row's rank is sportingly unambiguous.
   * >1 means this row is part of a genuine tie block — `rank` still
   * assigns it one specific number (via the technical participantId
   * tiebreak, for a stable total order the table can always render), but
   * that number must NOT be treated as a sporting fact: which of the tied
   * teams "really" occupies which rank within the block is undetermined.
   * See group-position-resolution.ts, which refuses to resolve a
   * GROUP_POSITION slot pointing at any rank inside a block with size > 1.
   */
  tiedRankGroupSize: number;
}

interface Accumulator {
  participantId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

const POINTS_FOR_WIN = 3;
const POINTS_FOR_DRAW = 1;
const POINTS_FOR_LOSS = 0;

/**
 * Standard German/European league scoring (3/1/0). `participantIds` is the
 * group's full membership — included even for a team with zero completed
 * matches so an interim table always lists everyone. `completedMatches`
 * should contain ONLY matches that are actually decided (status
 * COMPLETED with both scores set) — a scheduled/postponed/cancelled match
 * contributes nothing here; filtering by status is the caller's
 * responsibility (this function has no concept of match status at all).
 * Order of `completedMatches` never affects the result.
 */
export function computeGroupStandings(participantIds: string[], completedMatches: GroupMatchResult[]): GroupStandingsRow[] {
  const byParticipant = new Map<string, Accumulator>();
  for (const participantId of participantIds) {
    byParticipant.set(participantId, {
      participantId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    });
  }

  for (const match of completedMatches) {
    const home = byParticipant.get(match.homeParticipantId);
    const away = byParticipant.get(match.awayParticipantId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      home.points += POINTS_FOR_WIN;
      away.losses += 1;
      away.points += POINTS_FOR_LOSS;
    } else if (match.awayScore > match.homeScore) {
      away.wins += 1;
      away.points += POINTS_FOR_WIN;
      home.losses += 1;
      home.points += POINTS_FOR_LOSS;
    } else {
      home.draws += 1;
      home.points += POINTS_FOR_DRAW;
      away.draws += 1;
      away.points += POINTS_FOR_DRAW;
    }
  }

  // Sporting order: points desc, goal difference desc, goals scored desc.
  // participantId asc is a purely TECHNICAL final tiebreak — it exists only
  // so the table has one deterministic total order to render (identical
  // input always produces identical output/row order), never presented as
  // a sporting result — see tiedRankGroupSize.
  const sorted = [...byParticipant.values()].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    const aDiff = a.goalsFor - a.goalsAgainst;
    const bDiff = b.goalsFor - b.goalsAgainst;
    if (aDiff !== bDiff) return bDiff - aDiff;
    if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
    return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
  });

  // Group consecutive rows sharing the exact same sporting triple into tie
  // blocks, based on the SAME sort keys used above (not the id tiebreak).
  const tieKey = (row: Accumulator) => `${row.points}|${row.goalsFor - row.goalsAgainst}|${row.goalsFor}`;
  const blockSizeByKey = new Map<string, number>();
  for (const row of sorted) {
    const key = tieKey(row);
    blockSizeByKey.set(key, (blockSizeByKey.get(key) ?? 0) + 1);
  }

  return sorted.map((row, index) => ({
    participantId: row.participantId,
    rank: index + 1,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalsFor - row.goalsAgainst,
    points: row.points,
    tiedRankGroupSize: blockSizeByKey.get(tieKey(row))!,
  }));
}
