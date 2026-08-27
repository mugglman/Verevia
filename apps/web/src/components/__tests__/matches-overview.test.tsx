import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchesOverview } from "../matches-overview";

const baseMatch = {
  id: "match-1",
  teamName: "E1",
  venueName: "Sportplatz Benediktbeuern",
  startsAt: "2026-09-12T08:00:00.000Z",
  type: "FRIENDLY" as const,
  status: "SCHEDULED" as const,
  homeAway: "HOME" as const,
  opponentName: "SV Beispielhausen",
  homeScore: null,
  awayScore: null,
};

describe("MatchesOverview", () => {
  it("shows an empty state when there are no matches", () => {
    render(<MatchesOverview departmentName="Fußball" matches={[]} canCreate={false} />);
    expect(screen.getByText(/noch keine spiele geplant/i)).toBeInTheDocument();
  });

  it("shows the matchup, home/away, venue and type", () => {
    render(<MatchesOverview departmentName="Fußball" matches={[baseMatch]} canCreate={false} />);
    expect(screen.getByText("E1 – SV Beispielhausen")).toBeInTheDocument();
    expect(screen.getByText(/heimspiel/i)).toBeInTheDocument();
    expect(screen.getByText(/sportplatz benediktbeuern/i)).toBeInTheDocument();
    expect(screen.getByText(/freundschaftsspiel/i)).toBeInTheDocument();
  });

  it("shows opponent first for an away match", () => {
    render(
      <MatchesOverview
        departmentName="Fußball"
        matches={[{ ...baseMatch, homeAway: "AWAY" }]}
        canCreate={false}
      />,
    );
    expect(screen.getByText("SV Beispielhausen – E1")).toBeInTheDocument();
  });

  it("shows the result for a completed match", () => {
    render(
      <MatchesOverview
        departmentName="Fußball"
        matches={[{ ...baseMatch, status: "COMPLETED", homeScore: 3, awayScore: 1 }]}
        canCreate={false}
      />,
    );
    expect(screen.getByText(/3:1/)).toBeInTheDocument();
    expect(screen.getByText(/abgeschlossen/i)).toBeInTheDocument();
  });

  it("hides the create link without permission", () => {
    render(<MatchesOverview departmentName="Fußball" matches={[]} canCreate={false} />);
    expect(screen.queryByText(/spiel anlegen/i)).not.toBeInTheDocument();
  });

  it("shows the create link with permission", () => {
    render(<MatchesOverview departmentName="Fußball" matches={[]} canCreate={true} />);
    expect(screen.getByText(/spiel anlegen/i)).toBeInTheDocument();
  });
});
