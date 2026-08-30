import { SCHEDULE_GENERATION_LIMITS } from "./limits";
import { sortGroups } from "./round-robin.generator";
import {
  Fixture,
  GroupInput,
  ParticipantInput,
  ScheduleConflict,
  ScheduledMatch,
  ScheduleResult,
  ScheduleSettings,
} from "./types";

interface Booking {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Interleaves each group's fixtures round-by-round ("round 1 of every
 * group, then round 2 of every group, ...") rather than draining one
 * group before starting the next — a more natural real-tournament-day
 * progression, and it happens to spread each participant's matches out
 * over the schedule instead of clustering them, which helps satisfy
 * `minimumRestMinutes` with fewer slots. Groups are visited in a stable
 * order (`sortGroups`); fixtures within a group/round keep their
 * generation order.
 */
function interleaveFixtures(fixturesByGroup: Map<string, Fixture[]>, groups: readonly GroupInput[]): Fixture[] {
  const orderedGroups = sortGroups(groups);
  let maxRound = -1;
  for (const list of fixturesByGroup.values()) {
    for (const fixture of list) {
      if (fixture.round > maxRound) maxRound = fixture.round;
    }
  }

  const queue: Fixture[] = [];
  for (let round = 0; round <= maxRound; round++) {
    for (const group of orderedGroups) {
      const groupFixtures = fixturesByGroup.get(group.id) ?? [];
      for (const fixture of groupFixtures) {
        if (fixture.round === round) {
          queue.push(fixture);
        }
      }
    }
  }
  return queue;
}

/** True if `candidate` is too close to (or overlaps) `existing`, given the required rest gap. */
function conflictsWithBooking(candidateStart: Date, candidateEnd: Date, existing: Booking, minimumRestMinutes: number): boolean {
  const restMs = minimumRestMinutes * 60_000;
  const candidateIsSafelyAfter = candidateStart.getTime() >= existing.endsAt.getTime() + restMs;
  const candidateIsSafelyBefore = candidateEnd.getTime() + restMs <= existing.startsAt.getTime();
  return !(candidateIsSafelyAfter || candidateIsSafelyBefore);
}

/**
 * Greedy, deterministic slot/venue assignment (work order section 14 —
 * deliberately not a general constraint solver). Time is divided into
 * fixed-width slots (`matchDurationMinutes + changeoverMinutes`); each
 * slot index has one "lane" per selected venue, so the same start time can
 * host one match per venue in parallel. Fixtures are processed in a fixed,
 * interleaved queue order; each is placed into the EARLIEST (slot, venue)
 * that is free for that venue and violates neither participant's rest
 * requirement against ALL of their other already-placed matches (checked
 * in both time directions, not just "the most recent one" — a
 * later-queued fixture can still legitimately land in an earlier slot than
 * one queued before it). If a fixture cannot be placed within the search
 * bound or before `tournamentEndsAt`, the whole result is `valid: false`
 * with a conflict describing which fixture couldn't be placed — never a
 * silently incomplete schedule.
 */
export function scheduleFixtures(
  fixtures: readonly Fixture[],
  groups: readonly GroupInput[],
  participants: readonly ParticipantInput[],
  settings: ScheduleSettings,
): ScheduleResult {
  if (settings.venueIds.length === 0) {
    return {
      valid: false,
      matches: [],
      conflicts: [{ code: "NO_VENUES", message: "Es ist keine Spielstätte für dieses Turnier ausgewählt." }],
    };
  }

  const participantNames = new Map(participants.map((p) => [p.id, p.displayName]));
  const groupNames = new Map(groups.map((g) => [g.id, g.name]));

  const fixturesByGroup = new Map<string, Fixture[]>();
  for (const fixture of fixtures) {
    const list = fixturesByGroup.get(fixture.groupId) ?? [];
    list.push(fixture);
    fixturesByGroup.set(fixture.groupId, list);
  }
  const queue = interleaveFixtures(fixturesByGroup, groups);

  const slotDurationMs = (settings.matchDurationMinutes + settings.changeoverMinutes) * 60_000;
  const matchDurationMs = settings.matchDurationMinutes * 60_000;

  const occupiedCells = new Set<string>();
  const participantBookings = new Map<string, Booking[]>();
  const matches: ScheduledMatch[] = [];
  const conflicts: ScheduleConflict[] = [];

  for (const fixture of queue) {
    let placed = false;

    slotSearch: for (let slotIndex = 0; slotIndex <= SCHEDULE_GENERATION_LIMITS.maxSlotSearchIndex; slotIndex++) {
      const startsAt = new Date(settings.schedulingStartsAt.getTime() + slotIndex * slotDurationMs);
      const endsAt = new Date(startsAt.getTime() + matchDurationMs);

      if (settings.tournamentEndsAt && endsAt.getTime() > settings.tournamentEndsAt.getTime()) {
        // Slots only move later — no later slot can work for this fixture either.
        break;
      }

      for (const venueId of settings.venueIds) {
        const cellKey = `${slotIndex}:${venueId}`;
        if (occupiedCells.has(cellKey)) continue;

        const homeBookings = participantBookings.get(fixture.homeParticipantId) ?? [];
        const awayBookings = participantBookings.get(fixture.awayParticipantId) ?? [];
        const hasConflict =
          homeBookings.some((b) => conflictsWithBooking(startsAt, endsAt, b, settings.minimumRestMinutes)) ||
          awayBookings.some((b) => conflictsWithBooking(startsAt, endsAt, b, settings.minimumRestMinutes));
        if (hasConflict) continue;

        occupiedCells.add(cellKey);
        participantBookings.set(fixture.homeParticipantId, [...homeBookings, { startsAt, endsAt }]);
        participantBookings.set(fixture.awayParticipantId, [...awayBookings, { startsAt, endsAt }]);
        matches.push({ ...fixture, venueId, startsAt, endsAt });
        placed = true;
        break slotSearch;
      }
    }

    if (!placed) {
      const home = participantNames.get(fixture.homeParticipantId) ?? fixture.homeParticipantId;
      const away = participantNames.get(fixture.awayParticipantId) ?? fixture.awayParticipantId;
      const group = groupNames.get(fixture.groupId) ?? fixture.groupId;
      conflicts.push({
        code: "UNPLACEABLE_FIXTURE",
        message: `Für "${home} – ${away}" (${group}) konnte innerhalb des verfügbaren Zeitraums kein Termin gefunden werden, der Spielfeld-Verfügbarkeit und Mindestpause einhält.`,
      });
    }
  }

  return { valid: conflicts.length === 0, matches: conflicts.length === 0 ? matches : [], conflicts };
}
