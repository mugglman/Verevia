import { SCHEDULE_GENERATION_LIMITS } from "./limits";
import { KnockoutMatchConfig, KnockoutScheduledMatch, KnockoutScheduleResult } from "./knockout-types";
import { ScheduleConflict, ScheduleSettings } from "./types";

interface Booking {
  startsAt: Date;
  endsAt: Date;
}

function conflictsWithBooking(candidateStart: Date, candidateEnd: Date, existing: Booking, minimumRestMinutes: number): boolean {
  const restMs = minimumRestMinutes * 60_000;
  const candidateIsSafelyAfter = candidateStart.getTime() >= existing.endsAt.getTime() + restMs;
  const candidateIsSafelyBefore = candidateEnd.getTime() + restMs <= existing.startsAt.getTime();
  return !(candidateIsSafelyAfter || candidateIsSafelyBefore);
}

/**
 * Schedules an already-generated, already-dependency-validated knockout
 * bracket (work order section 9). Reuses the exact slot-grid mechanism from
 * `scheduleFixtures` (Phase 12) — fixed-width time slots, one lane per
 * selected venue — but adds a second kind of constraint round-robin never
 * needed: a match whose home/away source is `WINNER_OF_MATCH`/
 * `LOSER_OF_MATCH` may not start before its source match ends plus
 * `minimumRestMinutes`, regardless of whether the actual participant is
 * known yet. Matches are processed in the given array order, which
 * `generateKnockoutBracket` always produces as valid dependency order
 * (every match's dependencies appear earlier in the array) — no separate
 * topological sort needed.
 *
 * Participant-level rest/overlap checks (work order section 9, "soweit
 * bereits konkrete Teams bekannt sind") apply only to `TEAM`-sourced sides
 * — `GROUP_POSITION`/`WINNER_OF_MATCH`/`LOSER_OF_MATCH` sides have no
 * concrete participant to check yet (see ADR 0010).
 */
export function scheduleKnockoutBracket(matches: readonly KnockoutMatchConfig[], settings: ScheduleSettings): KnockoutScheduleResult {
  if (settings.venueIds.length === 0) {
    return {
      valid: false,
      matches: [],
      conflicts: [{ code: "NO_VENUES", message: "Es ist keine Spielstätte für dieses Turnier ausgewählt." }],
    };
  }

  const slotDurationMs = (settings.matchDurationMinutes + settings.changeoverMinutes) * 60_000;
  const matchDurationMs = settings.matchDurationMinutes * 60_000;

  const occupiedCells = new Set<string>();
  const participantBookings = new Map<string, Booking[]>();
  const scheduledByKey = new Map<string, KnockoutScheduledMatch>();
  const conflicts: ScheduleConflict[] = [];
  const scheduled: KnockoutScheduledMatch[] = [];

  for (const match of matches) {
    // Earliest instant this match may start due to its bracket dependencies.
    let earliestAllowedStart = settings.schedulingStartsAt;
    for (const source of [match.home, match.away]) {
      if (source.type === "WINNER_OF_MATCH" || source.type === "LOSER_OF_MATCH") {
        const dependency = scheduledByKey.get(source.matchKey);
        if (dependency) {
          const requiredStart = new Date(dependency.endsAt.getTime() + settings.minimumRestMinutes * 60_000);
          if (requiredStart.getTime() > earliestAllowedStart.getTime()) {
            earliestAllowedStart = requiredStart;
          }
        }
      }
    }
    const concreteParticipantIds = [match.home, match.away]
      .filter((s): s is Extract<typeof s, { type: "TEAM" }> => s.type === "TEAM")
      .map((s) => s.participantId);

    let placed = false;
    const minSlotIndex = Math.max(0, Math.ceil((earliestAllowedStart.getTime() - settings.schedulingStartsAt.getTime()) / slotDurationMs));

    slotSearch: for (let slotIndex = minSlotIndex; slotIndex <= SCHEDULE_GENERATION_LIMITS.maxSlotSearchIndex; slotIndex++) {
      const startsAt = new Date(settings.schedulingStartsAt.getTime() + slotIndex * slotDurationMs);
      if (startsAt.getTime() < earliestAllowedStart.getTime()) continue;
      const endsAt = new Date(startsAt.getTime() + matchDurationMs);

      if (settings.tournamentEndsAt && endsAt.getTime() > settings.tournamentEndsAt.getTime()) {
        break;
      }

      for (const venueId of settings.venueIds) {
        const cellKey = `${slotIndex}:${venueId}`;
        if (occupiedCells.has(cellKey)) continue;

        const hasParticipantConflict = concreteParticipantIds.some((participantId) =>
          (participantBookings.get(participantId) ?? []).some((b) => conflictsWithBooking(startsAt, endsAt, b, settings.minimumRestMinutes)),
        );
        if (hasParticipantConflict) continue;

        occupiedCells.add(cellKey);
        for (const participantId of concreteParticipantIds) {
          participantBookings.set(participantId, [...(participantBookings.get(participantId) ?? []), { startsAt, endsAt }]);
        }
        const result: KnockoutScheduledMatch = { ...match, venueId, startsAt, endsAt };
        scheduledByKey.set(match.key, result);
        scheduled.push(result);
        placed = true;
        break slotSearch;
      }
    }

    if (!placed) {
      conflicts.push({
        code: "UNPLACEABLE_FIXTURE",
        message: `Für "${match.key}" konnte innerhalb des verfügbaren Zeitraums kein Termin gefunden werden, der Spielfeld-Verfügbarkeit, Mindestpause und die Abhängigkeit vom Vorgängerspiel einhält.`,
      });
    }
  }

  return { valid: conflicts.length === 0, matches: conflicts.length === 0 ? scheduled : [], conflicts };
}
