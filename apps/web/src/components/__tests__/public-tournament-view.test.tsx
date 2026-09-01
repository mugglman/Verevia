import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicTournamentView } from "../public-tournament-view";

const baseTournament = {
  id: "tournament-1",
  name: "Verevia Jugendcup 2026",
  description: "Fiktives Jugendturnier",
  startsAt: "2026-10-03T07:00:00.000Z",
  endsAt: "2026-10-03T16:00:00.000Z",
  status: "PLANNED" as const,
  mode: "GROUPS" as const,
  departmentName: "Fußball",
};

const participant1 = { id: "p1", label: "E1", groupId: "group-1", groupName: "Gruppe A", status: "ACTIVE" as const };
const participant2 = { id: "p2", label: "SV Testhausen", groupId: "group-1", groupName: "Gruppe A", status: "ACTIVE" as const };

const match = {
  id: "match-1",
  startsAt: "2026-10-03T08:00:00.000Z",
  status: "SCHEDULED" as const,
  homeLabel: "E1",
  awayLabel: "SV Testhausen",
  homeScore: null,
  awayScore: null,
  groupName: "Gruppe A",
  venueName: "Sportplatz Benediktbeuern",
};

describe("PublicTournamentView", () => {
  it("shows tournament name, status, mode, and department — no edit affordances anywhere", () => {
    render(<PublicTournamentView tournament={baseTournament} participants={[]} groups={[]} matches={[]} />);
    expect(screen.getByRole("heading", { name: "Verevia Jugendcup 2026" })).toBeInTheDocument();
    expect(screen.getByText(/geplant/i)).toBeInTheDocument();
    expect(screen.getByText(/gruppenphase/i)).toBeInTheDocument();
    expect(screen.getByText(/fußball/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the plain participant list (no table) for a group with no completed matches yet", () => {
    const group = { id: "group-1", name: "Gruppe A", displayOrder: 1, standings: [], isComplete: false };
    render(<PublicTournamentView tournament={baseTournament} participants={[participant1, participant2]} groups={[group]} matches={[]} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByText("E1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("SV Testhausen").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a live standings table (Zwischenstand) once at least one group match is completed", () => {
    const group = {
      id: "group-1",
      name: "Gruppe A",
      displayOrder: 1,
      isComplete: false,
      standings: [
        { participantId: "p1", rank: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, goalDifference: 2, points: 3, tiedRankGroupSize: 1 },
        { participantId: "p2", rank: 2, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 2, goalDifference: -2, points: 0, tiedRankGroupSize: 1 },
      ],
    };
    render(<PublicTournamentView tournament={baseTournament} participants={[participant1, participant2]} groups={[group]} matches={[]} />);
    expect(screen.getByText("Zwischenstand")).toBeInTheDocument();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("E1")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("3")).toBeInTheDocument();
  });

  it("marks a genuine sporting tie with an asterisk and an explanatory note, never guessing a placement", () => {
    const group = {
      id: "group-1",
      name: "Gruppe A",
      displayOrder: 1,
      isComplete: true,
      standings: [
        { participantId: "p1", rank: 1, played: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 1, tiedRankGroupSize: 2 },
        { participantId: "p2", rank: 2, played: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 1, tiedRankGroupSize: 2 },
      ],
    };
    render(<PublicTournamentView tournament={baseTournament} participants={[participant1, participant2]} groups={[group]} matches={[]} />);
    expect(screen.getByText("Endstand")).toBeInTheDocument();
    expect(screen.getByText(/platzierung sportlich nicht eindeutig/i)).toBeInTheDocument();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("1*")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("2*")).toBeInTheDocument();
  });

  it("shows a match's result and highlights the winner, without any result-entry form", () => {
    render(
      <PublicTournamentView
        tournament={baseTournament}
        participants={[participant1, participant2]}
        groups={[]}
        matches={[{ ...match, status: "COMPLETED", homeScore: 2, awayScore: 1 }]}
      />,
    );
    expect(screen.getByText(/2:1/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ergebnis/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tore heim/i)).not.toBeInTheDocument();
  });

  it("shows an honest draw note without inventing a winner", () => {
    render(
      <PublicTournamentView
        tournament={baseTournament}
        participants={[participant1, participant2]}
        groups={[]}
        matches={[{ ...match, status: "COMPLETED", homeScore: 1, awayScore: 1 }]}
      />,
    );
    expect(screen.getByText("Unentschieden")).toBeInTheDocument();
  });

  it("shows a still-pending knockout slot label as-is (e.g. Gruppe A, Platz 1), not a blank", () => {
    render(
      <PublicTournamentView
        tournament={baseTournament}
        participants={[]}
        groups={[]}
        matches={[{ ...match, homeLabel: "Gruppe A, Platz 1", awayLabel: "Gruppe A, Platz 2" }]}
      />,
    );
    expect(screen.getByText(/gruppe a, platz 1/i)).toBeInTheDocument();
    expect(screen.getByText(/gruppe a, platz 2/i)).toBeInTheDocument();
  });

  it("shows empty states when there are no participants/matches yet", () => {
    render(<PublicTournamentView tournament={baseTournament} participants={[]} groups={[]} matches={[]} />);
    expect(screen.getByText("Noch keine Teilnehmer.")).toBeInTheDocument();
    expect(screen.getByText("Noch keine Spiele angelegt.")).toBeInTheDocument();
  });
});
