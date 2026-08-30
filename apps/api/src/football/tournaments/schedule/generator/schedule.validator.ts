import { ParticipantInput, ScheduleConflict, ScheduledMatch, ScheduleSettings } from "./types";

export interface ScheduleValidationResult {
  valid: boolean;
  conflicts: ScheduleConflict[];
}

/**
 * Independently re-verifies a set of already-scheduled matches — separate
 * from `scheduleFixtures` (work order section 16: "Validator separat vom
 * eigentlichen Generator implementieren"). `scheduleFixtures` avoids
 * conflicts BY CONSTRUCTION; this function makes no assumption about how
 * `matches` was produced and re-checks every invariant from scratch, so it
 * can be fed deliberately-broken hand-built input in tests (self-matches,
 * double-booked venues, rest violations, schedules that run past the
 * tournament end, ...) independently of the generator.
 */
export function validateSchedule(
  matches: readonly ScheduledMatch[],
  participants: readonly ParticipantInput[],
  settings: ScheduleSettings,
): ScheduleValidationResult {
  const conflicts: ScheduleConflict[] = [];
  const participantNames = new Map(participants.map((p) => [p.id, p.displayName]));
  const knownParticipantIds = new Set(participants.map((p) => p.id));

  for (const match of matches) {
    if (match.homeParticipantId === match.awayParticipantId) {
      conflicts.push({
        code: "INVALID_MATCH",
        message: `Eine Mannschaft kann nicht gegen sich selbst antreten (${participantNames.get(match.homeParticipantId) ?? match.homeParticipantId}).`,
      });
    }
    if (!knownParticipantIds.has(match.homeParticipantId) || !knownParticipantIds.has(match.awayParticipantId)) {
      conflicts.push({
        code: "INVALID_MATCH",
        message: "Ein geplantes Spiel referenziert einen Teilnehmer, der nicht (mehr) zu diesem Turnier gehört.",
      });
    }
    if (match.endsAt.getTime() <= match.startsAt.getTime()) {
      conflicts.push({
        code: "INVALID_MATCH",
        message: "Ein geplantes Spiel hat eine ungültige Zeitspanne (Ende liegt nicht nach dem Start).",
      });
    }
    if (settings.tournamentEndsAt && match.endsAt.getTime() > settings.tournamentEndsAt.getTime()) {
      conflicts.push({
        code: "TOURNAMENT_END_EXCEEDED",
        message: `Der Spielplan würde das Turnierende überschreiten (Spiel endet ${match.endsAt.toISOString()}).`,
      });
    }
  }

  // Venue double-booking: any two matches on the same venue with overlapping time ranges.
  const byVenue = new Map<string, ScheduledMatch[]>();
  for (const match of matches) {
    const list = byVenue.get(match.venueId) ?? [];
    list.push(match);
    byVenue.set(match.venueId, list);
  }
  for (const [venueId, venueMatches] of byVenue) {
    const sorted = [...venueMatches].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.startsAt.getTime() < sorted[i - 1]!.endsAt.getTime()) {
        conflicts.push({
          code: "VENUE_OVERLAP",
          message: `Auf einer Spielstätte überschneiden sich zwei Spiele zeitlich (Spielstätte ${venueId}).`,
        });
      }
    }
  }

  // Participant overlap/rest: every pair of matches sharing a participant must respect minimumRestMinutes.
  const byParticipant = new Map<string, ScheduledMatch[]>();
  for (const match of matches) {
    for (const participantId of [match.homeParticipantId, match.awayParticipantId]) {
      const list = byParticipant.get(participantId) ?? [];
      list.push(match);
      byParticipant.set(participantId, list);
    }
  }
  const restMs = settings.minimumRestMinutes * 60_000;
  for (const [participantId, participantMatches] of byParticipant) {
    const sorted = [...participantMatches].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const gapMs = sorted[i]!.startsAt.getTime() - sorted[i - 1]!.endsAt.getTime();
      const name = participantNames.get(participantId) ?? participantId;
      if (gapMs < 0) {
        conflicts.push({
          code: "PARTICIPANT_OVERLAP",
          message: `${name} hat zwei zeitlich überschneidende Spiele.`,
        });
      } else if (gapMs < restMs) {
        const gapMinutes = Math.round(gapMs / 60_000);
        conflicts.push({
          code: "REST_VIOLATION",
          message: `${name} hätte zwischen zwei Spielen nur ${gapMinutes} Minuten Pause. Eingestellt sind mindestens ${settings.minimumRestMinutes} Minuten.`,
        });
      }
    }
  }

  return { valid: conflicts.length === 0, conflicts };
}
