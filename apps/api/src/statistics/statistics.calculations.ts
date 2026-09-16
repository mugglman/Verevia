/**
 * Pure domain logic for Phase 21: computes a team season's match- and
 * attendance-bilanz from already-fetched rows. DB-free, framework-free,
 * deterministic — no Prisma, no transactions, no side effects. Same
 * separation as group-standings.ts (Phase 16): the calculation is the
 * single source of truth, independently unit-testable from the
 * DB-/authorization-touching StatisticsService.
 */

export interface MatchResultRow {
  homeAway: "HOME" | "AWAY" | "NEUTRAL";
  homeScore: number | null;
  awayScore: number | null;
}

export interface MatchStatistics {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

/**
 * "Unsere Seite"-Konvention: identisch zu der bereits in
 * matches-overview.tsx etablierten Regel (`matchup()`) — nur `AWAY`
 * vertauscht die Perspektive, `NEUTRAL` zählt wie `HOME`. Keine zweite
 * Definition.
 */
export function computeMatchStatistics(matches: MatchResultRow[]): MatchStatistics {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const match of matches) {
    if (match.homeScore == null || match.awayScore == null) continue; // defensiv; COMPLETED hat beide gesetzt
    const ourScore = match.homeAway === "AWAY" ? match.awayScore : match.homeScore;
    const theirScore = match.homeAway === "AWAY" ? match.homeScore : match.awayScore;
    goalsFor += ourScore;
    goalsAgainst += theirScore;
    if (ourScore > theirScore) wins++;
    else if (ourScore === theirScore) draws++;
    else losses++;
  }

  return {
    played: matches.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
  };
}

export interface AttendanceRecordRow {
  rsvpStatus: "PENDING" | "ACCEPTED" | "DECLINED";
  attended: boolean | null;
}

export interface AttendanceStatistics {
  eventCount: number;
  accepted: number;
  declined: number;
  pending: number;
  attended: number;
  notAttended: number;
  notRecorded: number;
  /**
   * anwesend / (anwesend + abwesend) — `null`, wenn noch keine tatsächliche
   * Anwesenheit erfasst wurde (0/0 vermieden). Noch nicht erfasste
   * (`attended: null`) bzw. offene RSVPs (`PENDING`) fließen bewusst NICHT
   * in den Nenner ein — sie dürfen die Quote nicht künstlich verschlechtern
   * (siehe Arbeitsauftrag Abschnitt 3.1 und PHASE_21_STATISTICS_REPORT.md).
   */
  attendanceRate: number | null;
}

export function computeAttendanceStatistics(eventCount: number, records: AttendanceRecordRow[]): AttendanceStatistics {
  let accepted = 0;
  let declined = 0;
  let pending = 0;
  let attended = 0;
  let notAttended = 0;
  let notRecorded = 0;

  for (const record of records) {
    if (record.rsvpStatus === "ACCEPTED") accepted++;
    else if (record.rsvpStatus === "DECLINED") declined++;
    else pending++;

    if (record.attended === true) attended++;
    else if (record.attended === false) notAttended++;
    else notRecorded++;
  }

  const attendanceRate = attended + notAttended > 0 ? attended / (attended + notAttended) : null;

  return { eventCount, accepted, declined, pending, attended, notAttended, notRecorded, attendanceRate };
}
