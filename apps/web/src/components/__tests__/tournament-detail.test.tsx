import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  updateTournamentAction: vi.fn(() => vi.fn()),
  addInternalParticipantAction: vi.fn(() => vi.fn()),
  addExternalParticipantAction: vi.fn(() => vi.fn()),
  assignParticipantGroupAction: vi.fn(() => vi.fn()),
  createTournamentGroupAction: vi.fn(() => vi.fn()),
  addTournamentVenueAction: vi.fn(() => vi.fn()),
  removeTournamentVenueAction: vi.fn(() => vi.fn()),
  createTournamentMatchAction: vi.fn(() => vi.fn()),
  updateTournamentMatchResultAction: vi.fn(),
}));

import { TournamentDetail } from "../tournament-detail";

const baseTournament = {
  id: "tournament-1",
  name: "Verevia Jugendcup 2026",
  description: "Fiktives Jugendturnier",
  startsAt: "2026-10-03T07:00:00.000Z",
  endsAt: "2026-10-03T16:00:00.000Z",
  status: "PLANNED" as const,
  mode: "GROUPS" as const,
  canEdit: false,
};

const internalParticipant = {
  id: "participant-1",
  teamSeasonId: "ts-1",
  teamName: "E1",
  ageGroupName: "E-Jugend",
  externalName: null,
  groupId: "group-1",
  groupName: "Gruppe A",
  status: "ACTIVE" as const,
  seed: null,
};

const externalParticipant = {
  id: "participant-2",
  teamSeasonId: null,
  teamName: null,
  ageGroupName: null,
  externalName: "SV Testhausen",
  groupId: null,
  groupName: null,
  status: "ACTIVE" as const,
  seed: null,
};

const group = { id: "group-1", name: "Gruppe A", displayOrder: 1, standings: [], isComplete: false };
const venue = { venueId: "venue-1", venueName: "Sportplatz Benediktbeuern", displayOrder: 1, label: "Hauptplatz" };
const match = {
  id: "match-1",
  homeParticipantId: "participant-1",
  homeParticipantName: "E1",
  awayParticipantId: "participant-2",
  awayParticipantName: "SV Testhausen",
  tournamentGroupName: "Gruppe A",
  venueName: "Sportplatz Benediktbeuern",
  startsAt: "2026-10-03T08:00:00.000Z",
  status: "SCHEDULED" as const,
  homeAway: "HOME" as const,
  homeScore: null,
  awayScore: null,
  canEdit: false,
  resultLocked: false,
};

describe("TournamentDetail", () => {
  it("shows tournament name, status, and mode", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[]}
        groups={[]}
        venues={[]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Verevia Jugendcup 2026" })).toBeInTheDocument();
    expect(screen.getByText("Geplant")).toBeInTheDocument();
    expect(screen.getByText(/gruppenphase/i)).toBeInTheDocument();
  });

  it("links to the public tournament page for a non-DRAFT tournament", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[]}
        groups={[]}
        venues={[]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    const link = screen.getByRole("link", { name: /öffentliche turnierseite ansehen/i });
    expect(link).toHaveAttribute("href", "/turnier/tournament-1");
  });

  it("hides the public tournament page link for a DRAFT tournament (not yet meant to be public)", () => {
    render(
      <TournamentDetail
        tournament={{ ...baseTournament, status: "DRAFT" }}
        participants={[]}
        groups={[]}
        venues={[]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.queryByRole("link", { name: /öffentliche turnierseite ansehen/i })).not.toBeInTheDocument();
  });

  it("distinguishes internal (Verevia-Mannschaft) from external (Externe Mannschaft) participants", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[]}
        venues={[]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.getByText("E1 (E-Jugend)")).toBeInTheDocument();
    expect(screen.getByText("SV Testhausen")).toBeInTheDocument();
    expect(screen.getByText("Verevia-Mannschaft")).toBeInTheDocument();
    expect(screen.getByText("Externe Mannschaft")).toBeInTheDocument();
  });

  it("shows an empty state for participants, groups, venues, and matches", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[]}
        groups={[]}
        venues={[]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.getByText(/noch keine teilnehmer hinzugefügt/i)).toBeInTheDocument();
    expect(screen.getByText(/noch keine gruppen angelegt/i)).toBeInTheDocument();
    expect(screen.getByText(/noch keine spielstätten zugeordnet/i)).toBeInTheDocument();
    expect(screen.getByText(/noch keine spiele angelegt/i)).toBeInTheDocument();
  });

  it("shows a group with its assigned participant, and a venue with its label", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    // Appears twice: once as the group's own heading, once as the
    // read-only group label shown next to the assigned participant.
    expect(screen.getAllByText("Gruppe A").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Hauptplatz (Sportplatz Benediktbeuern)")).toBeInTheDocument();
  });

  it("shows the plain participant list (no table) for a group with no completed matches yet", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    // Appears twice: once in the main Teilnehmer list, once in the
    // group's own fallback participant list — same as the "assigned
    // participant" test above.
    expect(screen.getAllByText("E1 (E-Jugend)").length).toBeGreaterThanOrEqual(2);
  });

  it("shows an interim standings table (Zwischenstand) once at least one group match is completed", () => {
    const standingsGroup = {
      ...group,
      isComplete: false,
      standings: [
        { participantId: "participant-1", rank: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2, points: 3, tiedRankGroupSize: 1 },
        { participantId: "participant-2", rank: 2, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 1, goalsAgainst: 3, goalDifference: -2, points: 0, tiedRankGroupSize: 1 },
      ],
    };
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[standingsGroup]}
        venues={[]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.getByText("Zwischenstand")).toBeInTheDocument();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // header + 2 data rows
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("E1 (E-Jugend)")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("3")).toBeInTheDocument(); // points
    expect(within(rows[1]!).getByText("+2")).toBeInTheDocument(); // goal difference
    expect(within(rows[2]!).getByText("SV Testhausen")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("-2")).toBeInTheDocument();
  });

  it("shows a final standings table (Endstand) once the group is complete", () => {
    const standingsGroup = {
      ...group,
      isComplete: true,
      standings: [
        { participantId: "participant-1", rank: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, goalDifference: 2, points: 3, tiedRankGroupSize: 1 },
        { participantId: "participant-2", rank: 2, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 2, goalDifference: -2, points: 0, tiedRankGroupSize: 1 },
      ],
    };
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[standingsGroup]}
        venues={[]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.getByText("Endstand")).toBeInTheDocument();
    expect(screen.queryByText("Zwischenstand")).not.toBeInTheDocument();
  });

  it("marks a genuine sporting tie with an asterisk and an explanatory note, without hiding either team", () => {
    // Note: rank is always a distinct 1/2 (a stable total order the table
    // can render), tiedRankGroupSize=2 on BOTH rows is what actually
    // signals "sportingly not distinguishable" — see GroupStandingsRow.
    const standingsGroup = {
      ...group,
      isComplete: true,
      standings: [
        { participantId: "participant-1", rank: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 1, goalsAgainst: 0, goalDifference: 1, points: 3, tiedRankGroupSize: 2 },
        { participantId: "participant-2", rank: 2, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 1, goalsAgainst: 0, goalDifference: 1, points: 3, tiedRankGroupSize: 2 },
      ],
    };
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[standingsGroup]}
        venues={[]}
        matches={[]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.getByText(/platzierung sportlich nicht eindeutig/i)).toBeInTheDocument();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("1*")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("E1 (E-Jugend)")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("2*")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("SV Testhausen")).toBeInTheDocument();
  });

  it("displays tournament matches with home/away participants and group", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[match]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    // Home/away are separate <span>s (so a determinable winner can be
    // bolded, see tournament-detail.tsx) — assert on the combined text
    // content of the containing paragraph, not a single text node.
    expect(screen.getByText("E1").closest("p")).toHaveTextContent("E1 – SV Testhausen");
  });

  it("offers result entry for a playable, editable, not-yet-locked match", () => {
    render(
      <TournamentDetail
        tournament={{ ...baseTournament, canEdit: true }}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[{ ...match, canEdit: true }]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.getByRole("button", { name: "Ergebnis eintragen" })).toBeInTheDocument();
  });

  it("does not offer result entry for a match with an unresolved (pending) side", () => {
    render(
      <TournamentDetail
        tournament={{ ...baseTournament, canEdit: true }}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[{ ...match, canEdit: true, awayParticipantId: null, awayParticipantName: "Sieger (steht noch nicht fest)" }]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: /ergebnis/i })).not.toBeInTheDocument();
  });

  it("does not offer result entry without permission, even for a playable match", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[{ ...match, canEdit: false }]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: /ergebnis/i })).not.toBeInTheDocument();
  });

  it("shows a locked note instead of an entry affordance once the result has propagated", () => {
    render(
      <TournamentDetail
        tournament={{ ...baseTournament, canEdit: true }}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[{ ...match, canEdit: true, resultLocked: true, status: "COMPLETED", homeScore: 2, awayScore: 1 }]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: /ergebnis/i })).not.toBeInTheDocument();
    expect(screen.getByText(/bereits verwendet und kann nicht mehr geändert werden/i)).toBeInTheDocument();
  });

  it("visually highlights the winning side of a decided match", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[{ ...match, status: "COMPLETED", homeScore: 3, awayScore: 1 }]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    // "SV Testhausen" also appears once as a plain participant list entry —
    // scope to the match row itself to avoid ambiguity.
    const matchRow = within(screen.getByText(/3:1/).closest("li")!);
    expect(matchRow.getByText("E1")).toHaveClass("font-semibold");
    expect(matchRow.getByText("SV Testhausen")).not.toHaveClass("font-semibold");
  });

  it("shows a draw as such, without inventing a winner", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[{ ...match, status: "COMPLETED", homeScore: 1, awayScore: 1 }]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    const matchRow = within(screen.getByText(/unentschieden/i).closest("li")!);
    expect(matchRow.getByText("E1")).not.toHaveClass("font-semibold");
    expect(matchRow.getByText("SV Testhausen")).not.toHaveClass("font-semibold");
  });

  it("hides all edit/create affordances without permission (canEdit=false)", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[]}
        availableTeamSeasons={[{ id: "ts-2", teamName: "E2", ageGroupName: "E-Jugend" }]}
        availableVenues={[{ id: "venue-2", name: "Nebenplatz" }]}
      />,
    );
    expect(screen.queryByLabelText(/externe mannschaft hinzufügen/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/name der neuen gruppe/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/spielstätte auswählen/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/entfernen/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^speichern$/i })).not.toBeInTheDocument();
  });

  it("shows all edit/create affordances with permission (canEdit=true)", () => {
    render(
      <TournamentDetail
        tournament={{ ...baseTournament, canEdit: true }}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[]}
        availableTeamSeasons={[{ id: "ts-2", teamName: "E2", ageGroupName: "E-Jugend" }]}
        availableVenues={[{ id: "venue-2", name: "Nebenplatz" }]}
      />,
    );
    expect(screen.getByLabelText(/externe mannschaft hinzufügen/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/name der neuen gruppe/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/spielstätte auswählen/i)).toBeInTheDocument();
    expect(screen.getByText(/entfernen/i)).toBeInTheDocument();
    // Manual tournament match creation form appears once >= 2 active participants exist.
    expect(screen.getByLabelText(/heimmannschaft/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/auswärtsmannschaft/i)).toBeInTheDocument();
  });

  it("does not expose technical IDs in visible text", () => {
    render(
      <TournamentDetail
        tournament={baseTournament}
        participants={[internalParticipant, externalParticipant]}
        groups={[group]}
        venues={[venue]}
        matches={[match]}
        availableTeamSeasons={[]}
        availableVenues={[]}
      />,
    );
    expect(screen.queryByText(/tournament-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/participant-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ts-1/)).not.toBeInTheDocument();
  });
});
