import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  updateMatchAction: vi.fn(() => vi.fn()),
}));

import { MatchDetail } from "../match-detail";

const baseMatch = {
  id: "match-1",
  teamName: "E1",
  venueId: "venue-1",
  venueName: "Sportplatz Benediktbeuern",
  startsAt: "2026-09-12T08:00:00.000Z",
  type: "FRIENDLY" as const,
  status: "SCHEDULED" as const,
  homeAway: "HOME" as const,
  opponentName: "SV Beispielhausen",
  homeScore: null,
  awayScore: null,
  notes: null,
  canEdit: false,
};

const venues = [{ id: "venue-1", name: "Sportplatz Benediktbeuern" }];

describe("MatchDetail", () => {
  it("shows a read-only view without permission", () => {
    render(<MatchDetail match={baseMatch} venues={venues} />);
    expect(screen.getByText(/heimspiel/i)).toBeInTheDocument();
    expect(screen.getByText(/sportplatz benediktbeuern/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^gegner$/i)).not.toBeInTheDocument();
  });

  it("shows the edit form with permission", () => {
    render(<MatchDetail match={{ ...baseMatch, canEdit: true }} venues={venues} />);
    expect(screen.getByLabelText(/^gegner$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tore heim/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tore auswärts/i)).toBeInTheDocument();
  });

  it("shows the result for a completed match", () => {
    render(
      <MatchDetail
        match={{ ...baseMatch, status: "COMPLETED", homeScore: 3, awayScore: 1 }}
        venues={venues}
      />,
    );
    expect(screen.getByText(/3:1/)).toBeInTheDocument();
  });

  it("shows the current status badge even while editing", () => {
    render(<MatchDetail match={{ ...baseMatch, status: "COMPLETED", canEdit: true }} venues={venues} />);
    expect(screen.getAllByText("Abgeschlossen").length).toBeGreaterThan(0);
  });
});
