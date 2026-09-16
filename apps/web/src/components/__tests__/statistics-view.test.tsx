import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatisticsView, type StatisticsViewData } from "../statistics-view";

const baseData: StatisticsViewData = {
  teamSeasonId: "ts1",
  teamId: "t1",
  teamName: "E1",
  seasonId: "s1",
  seasonName: "2026/2027",
  matches: { played: 4, wins: 2, draws: 1, losses: 1, goalsFor: 7, goalsAgainst: 4, goalDifference: 3 },
  attendance: {
    eventCount: 1,
    accepted: 2,
    declined: 0,
    pending: 1,
    attended: 1,
    notAttended: 1,
    notRecorded: 1,
    attendanceRate: 0.5,
  },
};

describe("StatisticsView", () => {
  it("shows the team and season name", () => {
    render(<StatisticsView data={baseData} />);
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("2026/2027")).toBeInTheDocument();
  });

  it("shows Spielbilanz values", () => {
    render(<StatisticsView data={baseData} />);
    expect(screen.getByText("Spielbilanz")).toBeInTheDocument();
    expect(screen.getAllByText("4").length).toBeGreaterThan(0); // Spiele
    expect(screen.getAllByText("2").length).toBeGreaterThan(0); // Siege
  });

  it("shows Torbilanz with a signed goal difference", () => {
    render(<StatisticsView data={baseData} />);
    expect(screen.getByText("Torbilanz")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("shows a negative goal difference without a leading plus", () => {
    render(
      <StatisticsView
        data={{ ...baseData, matches: { ...baseData.matches, goalDifference: -2 } }}
      />,
    );
    expect(screen.getByText("-2")).toBeInTheDocument();
  });

  it("shows the attendance rate as a rounded percentage", () => {
    render(<StatisticsView data={baseData} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Anwesenheitsquote")).toBeInTheDocument();
  });

  it("shows a dash for the attendance rate when null (no recorded attendance yet)", () => {
    render(
      <StatisticsView
        data={{ ...baseData, attendance: { ...baseData.attendance, attendanceRate: null } }}
      />,
    );
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("shows Termine/Anwesend/Abwesend/Offen counts", () => {
    render(<StatisticsView data={baseData} />);
    expect(screen.getByText("Termine")).toBeInTheDocument();
    expect(screen.getByText("Anwesend")).toBeInTheDocument();
    expect(screen.getByText("Abwesend")).toBeInTheDocument();
    expect(screen.getByText("Offen")).toBeInTheDocument();
  });
});
