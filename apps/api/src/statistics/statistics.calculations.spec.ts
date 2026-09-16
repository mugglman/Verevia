import { describe, expect, it } from "vitest";
import { computeAttendanceStatistics, computeMatchStatistics } from "./statistics.calculations";

describe("computeMatchStatistics", () => {
  it("counts a HOME win correctly (goalsFor = homeScore)", () => {
    const result = computeMatchStatistics([{ homeAway: "HOME", homeScore: 3, awayScore: 1 }]);
    expect(result).toEqual({ played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2 });
  });

  it("counts an AWAY win correctly (goalsFor = awayScore — perspective flips, same convention as matches-overview.tsx)", () => {
    const result = computeMatchStatistics([{ homeAway: "AWAY", homeScore: 1, awayScore: 4 }]);
    expect(result).toEqual({ played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 4, goalsAgainst: 1, goalDifference: 3 });
  });

  it("treats NEUTRAL the same as HOME (goalsFor = homeScore)", () => {
    const result = computeMatchStatistics([{ homeAway: "NEUTRAL", homeScore: 2, awayScore: 2 }]);
    expect(result.goalsFor).toBe(2);
    expect(result.goalsAgainst).toBe(2);
    expect(result.draws).toBe(1);
  });

  it("counts a draw correctly regardless of home/away", () => {
    const result = computeMatchStatistics([{ homeAway: "HOME", homeScore: 1, awayScore: 1 }]);
    expect(result).toEqual({ played: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0 });
  });

  it("counts a loss correctly", () => {
    const resultHome = computeMatchStatistics([{ homeAway: "HOME", homeScore: 0, awayScore: 2 }]);
    expect(resultHome).toEqual({ played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 2, goalDifference: -2 });

    const resultAway = computeMatchStatistics([{ homeAway: "AWAY", homeScore: 3, awayScore: 0 }]);
    expect(resultAway).toEqual({ played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 3, goalDifference: -3 });
  });

  it("aggregates goal difference correctly across multiple matches", () => {
    const result = computeMatchStatistics([
      { homeAway: "HOME", homeScore: 3, awayScore: 1 }, // win, +2
      { homeAway: "AWAY", homeScore: 2, awayScore: 2 }, // draw, +0
      { homeAway: "HOME", homeScore: 0, awayScore: 1 }, // loss, -1
    ]);
    expect(result).toEqual({ played: 3, wins: 1, draws: 1, losses: 1, goalsFor: 5, goalsAgainst: 4, goalDifference: 1 });
  });

  it("Sonderfall: keine Spiele — alle Werte 0, kein Fehler", () => {
    const result = computeMatchStatistics([]);
    expect(result).toEqual({ played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 });
  });

  it("skips a defensively-incomplete row (null score) without throwing", () => {
    const result = computeMatchStatistics([{ homeAway: "HOME", homeScore: null, awayScore: null }]);
    // played counts the row itself (it was fetched as a match), but no
    // score/result is derived from it.
    expect(result.played).toBe(1);
    expect(result.wins + result.draws + result.losses).toBe(0);
    expect(result.goalsFor).toBe(0);
    expect(result.goalsAgainst).toBe(0);
  });
});

describe("computeAttendanceStatistics", () => {
  it("counts RSVP statuses correctly", () => {
    const result = computeAttendanceStatistics(1, [
      { rsvpStatus: "ACCEPTED", attended: null },
      { rsvpStatus: "ACCEPTED", attended: null },
      { rsvpStatus: "DECLINED", attended: null },
      { rsvpStatus: "PENDING", attended: null },
    ]);
    expect(result.accepted).toBe(2);
    expect(result.declined).toBe(1);
    expect(result.pending).toBe(1);
  });

  it("berechnet die Anwesenheitsquote als anwesend / (anwesend + abwesend)", () => {
    const result = computeAttendanceStatistics(1, [
      { rsvpStatus: "ACCEPTED", attended: true },
      { rsvpStatus: "ACCEPTED", attended: true },
      { rsvpStatus: "ACCEPTED", attended: false },
    ]);
    expect(result.attended).toBe(2);
    expect(result.notAttended).toBe(1);
    expect(result.attendanceRate).toBeCloseTo(2 / 3);
  });

  it("offene bzw. nicht erfasste Einträge verschlechtern die Quote NICHT (werden aus dem Nenner ausgeschlossen)", () => {
    // 2 von 2 tatsächlich erfassten waren da — die Quote muss 1.0 bleiben,
    // unabhängig davon, wie viele PENDING/nicht erfasste Einträge daneben
    // existieren.
    const result = computeAttendanceStatistics(1, [
      { rsvpStatus: "ACCEPTED", attended: true },
      { rsvpStatus: "ACCEPTED", attended: true },
      { rsvpStatus: "PENDING", attended: null },
      { rsvpStatus: "PENDING", attended: null },
      { rsvpStatus: "DECLINED", attended: null },
    ]);
    expect(result.attendanceRate).toBe(1);
    expect(result.notRecorded).toBe(3);
  });

  it("Sonderfall: keine Attendance-Daten — Quote ist null (kein 0/0), alle Zähler 0", () => {
    const result = computeAttendanceStatistics(0, []);
    expect(result).toEqual({
      eventCount: 0,
      accepted: 0,
      declined: 0,
      pending: 0,
      attended: 0,
      notAttended: 0,
      notRecorded: 0,
      attendanceRate: null,
    });
  });

  it("Sonderfall: Termine vorhanden, aber noch keine einzige Anwesenheit erfasst — Quote bleibt null", () => {
    const result = computeAttendanceStatistics(3, [
      { rsvpStatus: "ACCEPTED", attended: null },
      { rsvpStatus: "PENDING", attended: null },
    ]);
    expect(result.eventCount).toBe(3);
    expect(result.attendanceRate).toBeNull();
  });

  it("zählt attended=false separat von notRecorded (attended=null)", () => {
    const result = computeAttendanceStatistics(1, [
      { rsvpStatus: "ACCEPTED", attended: false },
      { rsvpStatus: "ACCEPTED", attended: null },
    ]);
    expect(result.notAttended).toBe(1);
    expect(result.notRecorded).toBe(1);
    expect(result.attendanceRate).toBe(0);
  });
});
