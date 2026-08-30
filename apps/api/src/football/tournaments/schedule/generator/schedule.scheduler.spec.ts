import { describe, expect, it } from "vitest";
import { generateRoundRobinFixtures } from "./round-robin.generator";
import { scheduleFixtures } from "./schedule.scheduler";
import { Fixture, GroupInput, ParticipantInput, ScheduleSettings } from "./types";

const START = new Date("2026-12-05T09:00:00.000Z");

function participant(id: string, groupId: string, overrides: Partial<ParticipantInput> = {}): ParticipantInput {
  return { id, groupId, seed: null, createdAt: new Date("2026-01-01T00:00:00.000Z"), displayName: id, ...overrides };
}

function baseSettings(overrides: Partial<ScheduleSettings> = {}): ScheduleSettings {
  return {
    matchDurationMinutes: 10,
    changeoverMinutes: 2,
    minimumRestMinutes: 10,
    venueIds: ["venue-1"],
    schedulingStartsAt: START,
    tournamentEndsAt: null,
    ...overrides,
  };
}

describe("scheduleFixtures", () => {
  it("rejects with NO_VENUES when no venue is selected", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const participants = [participant("p1", "g1"), participant("p2", "g1")];
    const fixtures = generateRoundRobinFixtures("g1", ["p1", "p2"]);
    const result = scheduleFixtures(fixtures, [groupA], participants, baseSettings({ venueIds: [] }));
    expect(result.valid).toBe(false);
    expect(result.conflicts[0]?.code).toBe("NO_VENUES");
  });

  it("schedules 1 venue on the slot grid (duration + changeover), skipping slots where rest would be violated", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const participants = [participant("p1", "g1"), participant("p2", "g1"), participant("p3", "g1"), participant("p4", "g1")];
    const fixtures = generateRoundRobinFixtures("g1", ["p1", "p2", "p3", "p4"]);
    const result = scheduleFixtures(fixtures, [groupA], participants, baseSettings());
    expect(result.valid).toBe(true);
    expect(result.matches).toHaveLength(6);

    const slotDurationMs = 12 * 60_000; // 10 (duration) + 2 (changeover)
    const sorted = [...result.matches].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]!;
      // Every match starts on a slot-grid boundary relative to the scheduling start...
      const offsetMs = current.startsAt.getTime() - START.getTime();
      expect(offsetMs % slotDurationMs).toBe(0);
      expect(current.endsAt.getTime()).toBe(current.startsAt.getTime() + 10 * 60_000);
      // ...and no two matches on the single shared venue ever overlap.
      if (i > 0) {
        expect(current.startsAt.getTime()).toBeGreaterThanOrEqual(sorted[i - 1]!.endsAt.getTime());
      }
    }
  });

  it("uses multiple venues in parallel — same start time can host one match per venue", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const participants = [
      participant("p1", "g1"),
      participant("p2", "g1"),
      participant("p3", "g1"),
      participant("p4", "g1"),
    ];
    const fixtures = generateRoundRobinFixtures("g1", ["p1", "p2", "p3", "p4"]);
    const result = scheduleFixtures(fixtures, [groupA], participants, baseSettings({ venueIds: ["venue-1", "venue-2"] }));
    expect(result.valid).toBe(true);
    const startTimes = new Set(result.matches.map((m) => m.startsAt.getTime()));
    // 6 matches across 2 venues should need only 3 distinct start times.
    expect(startTimes.size).toBe(3);
  });

  it("never double-books a venue at the same time", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const groupB: GroupInput = { id: "g2", name: "Gruppe B", displayOrder: 1 };
    const participantsA = ["a1", "a2", "a3", "a4"].map((id) => participant(id, "g1"));
    const participantsB = ["b1", "b2", "b3", "b4"].map((id) => participant(id, "g2"));
    const fixtures = [
      ...generateRoundRobinFixtures("g1", participantsA.map((p) => p.id)),
      ...generateRoundRobinFixtures("g2", participantsB.map((p) => p.id)),
    ];
    const result = scheduleFixtures(
      fixtures,
      [groupA, groupB],
      [...participantsA, ...participantsB],
      baseSettings({ venueIds: ["venue-1", "venue-2", "venue-3"] }),
    );
    expect(result.valid).toBe(true);

    const seenCells = new Set<string>();
    for (const match of result.matches) {
      const cell = `${match.startsAt.toISOString()}:${match.venueId}`;
      expect(seenCells.has(cell)).toBe(false);
      seenCells.add(cell);
    }
  });

  it("never schedules the same participant into two overlapping matches, and respects minimumRestMinutes", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const participants = ["p1", "p2", "p3", "p4", "p5"].map((id) => participant(id, "g1"));
    const fixtures = generateRoundRobinFixtures("g1", participants.map((p) => p.id)); // odd → BYE handled
    const result = scheduleFixtures(fixtures, [groupA], participants, baseSettings({ venueIds: ["venue-1", "venue-2"], minimumRestMinutes: 15 }));
    expect(result.valid).toBe(true);

    const byParticipant = new Map<string, { start: number; end: number }[]>();
    for (const match of result.matches) {
      for (const pid of [match.homeParticipantId, match.awayParticipantId]) {
        const list = byParticipant.get(pid) ?? [];
        list.push({ start: match.startsAt.getTime(), end: match.endsAt.getTime() });
        byParticipant.set(pid, list);
      }
    }
    for (const bookings of byParticipant.values()) {
      const sorted = bookings.sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.start - sorted[i - 1]!.end).toBeGreaterThanOrEqual(15 * 60_000);
      }
    }
  });

  it("handles an odd participant count (BYE) without producing an extra match", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const participants = ["p1", "p2", "p3", "p4", "p5"].map((id) => participant(id, "g1"));
    const fixtures = generateRoundRobinFixtures("g1", participants.map((p) => p.id));
    const result = scheduleFixtures(fixtures, [groupA], participants, baseSettings({ venueIds: ["venue-1"] }));
    expect(result.valid).toBe(true);
    expect(result.matches).toHaveLength(10); // 5*4/2
  });

  it("multiple groups never produce cross-group matches", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const groupB: GroupInput = { id: "g2", name: "Gruppe B", displayOrder: 1 };
    const participantsA = ["a1", "a2", "a3"].map((id) => participant(id, "g1"));
    const participantsB = ["b1", "b2", "b3"].map((id) => participant(id, "g2"));
    const fixtures = [
      ...generateRoundRobinFixtures("g1", participantsA.map((p) => p.id)),
      ...generateRoundRobinFixtures("g2", participantsB.map((p) => p.id)),
    ];
    const result = scheduleFixtures(
      fixtures,
      [groupA, groupB],
      [...participantsA, ...participantsB],
      baseSettings({ venueIds: ["venue-1"] }),
    );
    expect(result.valid).toBe(true);
    for (const match of result.matches) {
      const aIds = new Set(participantsA.map((p) => p.id));
      const bIds = new Set(participantsB.map((p) => p.id));
      const bothInA = aIds.has(match.homeParticipantId) && aIds.has(match.awayParticipantId);
      const bothInB = bIds.has(match.homeParticipantId) && bIds.has(match.awayParticipantId);
      expect(bothInA || bothInB).toBe(true);
    }
  });

  it("returns valid:false with a clear conflict when the tournament end is too tight for 1 venue", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const participants = ["p1", "p2", "p3", "p4"].map((id) => participant(id, "g1"));
    const fixtures = generateRoundRobinFixtures("g1", participants.map((p) => p.id)); // 6 matches
    const tightEnd = new Date(START.getTime() + 20 * 60_000); // only room for ~1 match on 1 venue
    const result = scheduleFixtures(fixtures, [groupA], participants, baseSettings({ venueIds: ["venue-1"], tournamentEndsAt: tightEnd }));
    expect(result.valid).toBe(false);
    expect(result.matches).toHaveLength(0);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]?.code).toBe("UNPLACEABLE_FIXTURE");
    expect(result.conflicts[0]?.message).not.toMatch(/undefined|NaN/);
  });

  it("succeeds when the tournament end comfortably fits the schedule", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const participants = ["p1", "p2", "p3", "p4"].map((id) => participant(id, "g1"));
    const fixtures = generateRoundRobinFixtures("g1", participants.map((p) => p.id));
    const roomyEnd = new Date(START.getTime() + 2 * 60 * 60_000);
    const result = scheduleFixtures(fixtures, [groupA], participants, baseSettings({ venueIds: ["venue-1"], tournamentEndsAt: roomyEnd }));
    expect(result.valid).toBe(true);
    expect(result.matches).toHaveLength(6);
  });

  it("is deterministic given identical input", () => {
    const groupA: GroupInput = { id: "g1", name: "Gruppe A", displayOrder: 0 };
    const participants = ["p1", "p2", "p3", "p4", "p5"].map((id) => participant(id, "g1"));
    const fixtures: Fixture[] = generateRoundRobinFixtures("g1", participants.map((p) => p.id));
    const settings = baseSettings({ venueIds: ["venue-1", "venue-2"] });
    const first = scheduleFixtures(fixtures, [groupA], participants, settings);
    const second = scheduleFixtures(fixtures, [groupA], participants, settings);
    expect(second).toEqual(first);
  });
});
