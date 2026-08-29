import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TournamentsOverview } from "../tournaments-overview";

const baseTournament = {
  id: "tournament-1",
  name: "Verevia Jugendcup 2026",
  startsAt: "2026-10-03T07:00:00.000Z",
  endsAt: "2026-10-03T16:00:00.000Z",
  status: "PLANNED" as const,
  mode: "GROUPS" as const,
  participantCount: 4,
  groupCount: 2,
};

describe("TournamentsOverview", () => {
  it("shows an empty state when there are no tournaments", () => {
    render(<TournamentsOverview departmentName="Fußball" tournaments={[]} canCreate={false} />);
    expect(screen.getByText(/noch keine turniere angelegt/i)).toBeInTheDocument();
  });

  it("shows tournament name, status, and participant/group counts", () => {
    render(<TournamentsOverview departmentName="Fußball" tournaments={[baseTournament]} canCreate={false} />);
    expect(screen.getByText("Verevia Jugendcup 2026")).toBeInTheDocument();
    expect(screen.getByText("Geplant")).toBeInTheDocument();
    expect(screen.getByText(/4 teilnehmer/i)).toBeInTheDocument();
    expect(screen.getByText(/2 gruppen/i)).toBeInTheDocument();
  });

  it("hides the create link without permission", () => {
    render(<TournamentsOverview departmentName="Fußball" tournaments={[]} canCreate={false} />);
    expect(screen.queryByText(/turnier anlegen/i)).not.toBeInTheDocument();
  });

  it("shows the create link with permission", () => {
    render(<TournamentsOverview departmentName="Fußball" tournaments={[]} canCreate={true} />);
    expect(screen.getByText(/turnier anlegen/i)).toBeInTheDocument();
  });

  it("does not expose technical IDs in visible text", () => {
    render(<TournamentsOverview departmentName="Fußball" tournaments={[baseTournament]} canCreate={false} />);
    expect(screen.queryByText(/tournament-1/)).not.toBeInTheDocument();
  });
});
