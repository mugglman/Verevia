import { describe, expect, it } from "vitest";
import { validateSchedule } from "./schedule.validator";
import { ParticipantInput, ScheduledMatch, ScheduleSettings } from "./types";

const START = new Date("2026-12-05T09:00:00.000Z");

function participant(id: string, groupId: string): ParticipantInput {
  return { id, groupId, seed: null, createdAt: START, displayName: id };
}

function match(overrides: Partial<ScheduledMatch> = {}): ScheduledMatch {
  return {
    groupId: "g1",
    round: 0,
    homeParticipantId: "p1",
    awayParticipantId: "p2",
    venueId: "venue-1",
    startsAt: START,
    endsAt: new Date(START.getTime() + 10 * 60_000),
    ...overrides,
  };
}

function settings(overrides: Partial<ScheduleSettings> = {}): ScheduleSettings {
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

describe("validateSchedule", () => {
  const participants = [participant("p1", "g1"), participant("p2", "g1"), participant("p3", "g1"), participant("p4", "g1")];

  it("accepts a clean, non-conflicting schedule", () => {
    const matches = [
      match({ homeParticipantId: "p1", awayParticipantId: "p2", startsAt: START, endsAt: new Date(START.getTime() + 10 * 60_000) }),
      match({
        homeParticipantId: "p3",
        awayParticipantId: "p4",
        venueId: "venue-2",
        startsAt: START,
        endsAt: new Date(START.getTime() + 10 * 60_000),
      }),
    ];
    const result = validateSchedule(matches, participants, settings({ venueIds: ["venue-1", "venue-2"] }));
    expect(result.valid).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it("detects a participant scheduled twice at overlapping times (same venue used twice illustratively)", () => {
    const matches = [
      match({ homeParticipantId: "p1", awayParticipantId: "p2", startsAt: START, endsAt: new Date(START.getTime() + 10 * 60_000) }),
      match({
        homeParticipantId: "p1",
        awayParticipantId: "p3",
        venueId: "venue-2",
        startsAt: new Date(START.getTime() + 5 * 60_000),
        endsAt: new Date(START.getTime() + 15 * 60_000),
      }),
    ];
    const result = validateSchedule(matches, participants, settings({ venueIds: ["venue-1", "venue-2"] }));
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "PARTICIPANT_OVERLAP")).toBe(true);
  });

  it("detects a venue double-booked at overlapping times", () => {
    const matches = [
      match({ homeParticipantId: "p1", awayParticipantId: "p2", venueId: "venue-1", startsAt: START, endsAt: new Date(START.getTime() + 10 * 60_000) }),
      match({
        homeParticipantId: "p3",
        awayParticipantId: "p4",
        venueId: "venue-1",
        startsAt: new Date(START.getTime() + 5 * 60_000),
        endsAt: new Date(START.getTime() + 15 * 60_000),
      }),
    ];
    const result = validateSchedule(matches, participants, settings());
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "VENUE_OVERLAP")).toBe(true);
  });

  it("detects a minimum-rest violation between two non-overlapping matches", () => {
    const matches = [
      match({ homeParticipantId: "p1", awayParticipantId: "p2", venueId: "venue-1", startsAt: START, endsAt: new Date(START.getTime() + 10 * 60_000) }),
      match({
        homeParticipantId: "p1",
        awayParticipantId: "p3",
        venueId: "venue-2",
        startsAt: new Date(START.getTime() + 12 * 60_000), // only 2 minutes after p1's first match ends
        endsAt: new Date(START.getTime() + 22 * 60_000),
      }),
    ];
    const result = validateSchedule(matches, participants, settings({ venueIds: ["venue-1", "venue-2"], minimumRestMinutes: 10 }));
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "REST_VIOLATION")).toBe(true);
  });

  it("detects a self-match (participant plays against itself)", () => {
    const matches = [match({ homeParticipantId: "p1", awayParticipantId: "p1" })];
    const result = validateSchedule(matches, participants, settings());
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "INVALID_MATCH")).toBe(true);
  });

  it("detects a match referencing a participant that isn't in the given participant set (wrong tournament/removed)", () => {
    const matches = [match({ homeParticipantId: "unknown-participant", awayParticipantId: "p2" })];
    const result = validateSchedule(matches, participants, settings());
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "INVALID_MATCH")).toBe(true);
  });

  it("detects an invalid time span (endsAt not after startsAt)", () => {
    const matches = [match({ startsAt: START, endsAt: START })];
    const result = validateSchedule(matches, participants, settings());
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "INVALID_MATCH")).toBe(true);
  });

  it("detects the tournament end being exceeded", () => {
    const tournamentEndsAt = new Date(START.getTime() + 5 * 60_000);
    const matches = [match({ startsAt: START, endsAt: new Date(START.getTime() + 10 * 60_000) })];
    const result = validateSchedule(matches, participants, settings({ tournamentEndsAt }));
    expect(result.valid).toBe(false);
    expect(result.conflicts.some((c) => c.code === "TOURNAMENT_END_EXCEEDED")).toBe(true);
  });

  it("accepts a schedule that ends exactly at the tournament end", () => {
    const tournamentEndsAt = new Date(START.getTime() + 10 * 60_000);
    const matches = [match({ startsAt: START, endsAt: tournamentEndsAt })];
    const result = validateSchedule(matches, participants, settings({ tournamentEndsAt }));
    expect(result.valid).toBe(true);
  });

  it("an empty schedule is trivially valid", () => {
    const result = validateSchedule([], participants, settings());
    expect(result.valid).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });
});
