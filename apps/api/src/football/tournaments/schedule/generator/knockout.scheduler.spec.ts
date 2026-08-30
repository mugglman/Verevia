import { describe, expect, it } from "vitest";
import { generateKnockoutBracket } from "./knockout-bracket.generator";
import { scheduleKnockoutBracket } from "./knockout.scheduler";
import { KnockoutMatchConfig, SlotSource } from "./knockout-types";
import { ScheduleSettings } from "./types";

const START = new Date("2026-12-05T09:00:00.000Z");

function teamSources(n: number): SlotSource[] {
  return Array.from({ length: n }, (_, i) => ({ type: "TEAM" as const, participantId: `p${i + 1}` }));
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

describe("scheduleKnockoutBracket", () => {
  it("rejects with NO_VENUES when no venue is selected", () => {
    const bracket = generateKnockoutBracket(teamSources(2), false);
    const result = scheduleKnockoutBracket(bracket.matches, baseSettings({ venueIds: [] }));
    expect(result.valid).toBe(false);
    expect(result.conflicts[0]?.code).toBe("NO_VENUES");
  });

  it("schedules the final only after the semifinal ends plus minimumRestMinutes", () => {
    const bracket = generateKnockoutBracket(teamSources(4), false);
    const result = scheduleKnockoutBracket(bracket.matches, baseSettings({ venueIds: ["venue-1", "venue-2"], minimumRestMinutes: 20 }));
    expect(result.valid).toBe(true);

    const sf1 = result.matches.find((m) => m.key === "SF-1")!;
    const sf2 = result.matches.find((m) => m.key === "SF-2")!;
    const final = result.matches.find((m) => m.key === "FINAL")!;
    const latestSemifinalEnd = Math.max(sf1.endsAt.getTime(), sf2.endsAt.getTime());
    expect(final.startsAt.getTime()).toBeGreaterThanOrEqual(latestSemifinalEnd + 20 * 60_000);
  });

  it("never schedules a dependent match before its source match", () => {
    const bracket = generateKnockoutBracket(teamSources(8), true);
    const result = scheduleKnockoutBracket(bracket.matches, baseSettings({ venueIds: ["venue-1", "venue-2", "venue-3"] }));
    expect(result.valid).toBe(true);

    const byKey = new Map(result.matches.map((m) => [m.key, m]));
    for (const match of bracket.matches) {
      for (const source of [match.home, match.away]) {
        if (source.type === "WINNER_OF_MATCH" || source.type === "LOSER_OF_MATCH") {
          const dependency = byKey.get(source.matchKey)!;
          const dependent = byKey.get(match.key)!;
          expect(dependent.startsAt.getTime()).toBeGreaterThanOrEqual(dependency.endsAt.getTime() + 10 * 60_000);
        }
      }
    }
  });

  it("never double-books a venue at the same time", () => {
    const bracket = generateKnockoutBracket(teamSources(8), true);
    const result = scheduleKnockoutBracket(bracket.matches, baseSettings({ venueIds: ["venue-1", "venue-2"] }));
    expect(result.valid).toBe(true);

    const seenCells = new Set<string>();
    for (const match of result.matches) {
      const cell = `${match.startsAt.toISOString()}:${match.venueId}`;
      expect(seenCells.has(cell)).toBe(false);
      seenCells.add(cell);
    }
  });

  it("never schedules the same concrete (TEAM) participant into two overlapping/insufficiently-rested matches", () => {
    // 6 entrants → p1 and p2 are BYE-advanced, so they appear as concrete
    // TEAM sources directly in the semifinals (see bracket generator tests)
    // — a good real case to check participant-level conflicts across rounds.
    const bracket = generateKnockoutBracket(teamSources(6), false);
    const result = scheduleKnockoutBracket(bracket.matches, baseSettings({ venueIds: ["venue-1", "venue-2"], minimumRestMinutes: 15 }));
    expect(result.valid).toBe(true);

    const byParticipant = new Map<string, { start: number; end: number }[]>();
    for (const match of result.matches) {
      for (const source of [match.home, match.away]) {
        if (source.type === "TEAM") {
          const list = byParticipant.get(source.participantId) ?? [];
          list.push({ start: match.startsAt.getTime(), end: match.endsAt.getTime() });
          byParticipant.set(source.participantId, list);
        }
      }
    }
    for (const bookings of byParticipant.values()) {
      const sorted = bookings.sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.start - sorted[i - 1]!.end).toBeGreaterThanOrEqual(15 * 60_000);
      }
    }
  });

  it("respects matchDuration/changeover slot granularity", () => {
    const bracket = generateKnockoutBracket(teamSources(2), false);
    const result = scheduleKnockoutBracket(bracket.matches, baseSettings());
    expect(result.valid).toBe(true);
    const final = result.matches[0]!;
    expect(final.startsAt.getTime()).toBe(START.getTime());
    expect(final.endsAt.getTime()).toBe(START.getTime() + 10 * 60_000);
  });

  it("uses multiple venues to schedule independent early-round matches in parallel", () => {
    const bracket = generateKnockoutBracket(teamSources(8), false);
    const result = scheduleKnockoutBracket(bracket.matches, baseSettings({ venueIds: ["venue-1", "venue-2"] }));
    expect(result.valid).toBe(true);
    const qfMatches = result.matches.filter((m) => m.round === "QUARTERFINAL");
    const startTimes = new Set(qfMatches.map((m) => m.startsAt.getTime()));
    // 4 quarterfinals across 2 venues should need only 2 distinct start times.
    expect(startTimes.size).toBe(2);
  });

  it("returns valid:false with a clear conflict when the tournament end is too tight", () => {
    const bracket = generateKnockoutBracket(teamSources(4), false);
    const tightEnd = new Date(START.getTime() + 15 * 60_000); // only room for 1 match
    const result = scheduleKnockoutBracket(bracket.matches, baseSettings({ venueIds: ["venue-1", "venue-2"], tournamentEndsAt: tightEnd }));
    expect(result.valid).toBe(false);
    expect(result.matches).toHaveLength(0);
    expect(result.conflicts.some((c) => c.code === "UNPLACEABLE_FIXTURE")).toBe(true);
  });

  it("succeeds when the tournament end comfortably fits the full bracket", () => {
    const bracket = generateKnockoutBracket(teamSources(4), true);
    const roomyEnd = new Date(START.getTime() + 4 * 60 * 60_000);
    const result = scheduleKnockoutBracket(bracket.matches, baseSettings({ venueIds: ["venue-1", "venue-2"], tournamentEndsAt: roomyEnd }));
    expect(result.valid).toBe(true);
    expect(result.matches).toHaveLength(4); // SF-1, SF-2, THIRD-PLACE, FINAL
  });

  it("is deterministic given identical input", () => {
    const bracket = generateKnockoutBracket(teamSources(8), true);
    const settings = baseSettings({ venueIds: ["venue-1", "venue-2"] });
    const first = scheduleKnockoutBracket(bracket.matches, settings);
    const second = scheduleKnockoutBracket(bracket.matches, settings);
    expect(second).toEqual(first);
  });

  it("GROUP_POSITION/WINNER_OF_MATCH/LOSER_OF_MATCH sides never trigger participant-level conflict checks (no ID to check)", () => {
    // A hand-built pair of matches both depending on the SAME prior match
    // as their LOSER_OF_MATCH source — should schedule independently,
    // since "loser of X" isn't a concrete participant to conflict-check.
    const matches: KnockoutMatchConfig[] = [
      { key: "SF-1", round: "SEMIFINAL", home: { type: "TEAM", participantId: "p1" }, away: { type: "TEAM", participantId: "p2" } },
      { key: "A", round: "QUARTERFINAL", home: { type: "LOSER_OF_MATCH", matchKey: "SF-1" }, away: { type: "TEAM", participantId: "p3" } },
      { key: "B", round: "QUARTERFINAL", home: { type: "LOSER_OF_MATCH", matchKey: "SF-1" }, away: { type: "TEAM", participantId: "p4" } },
    ];
    const result = scheduleKnockoutBracket(matches, baseSettings({ venueIds: ["venue-1", "venue-2"] }));
    expect(result.valid).toBe(true);
  });
});
