import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FootballOverview } from "../football-overview";

const baseDepartment = { id: "dept-1", name: "Fußball", canManage: false };
const baseSeason = { id: "season-1", name: "2026/2027", startsAt: "2026-08-01", endsAt: "2027-06-30" };

describe("FootballOverview", () => {
  it("shows an empty state when no football department exists", () => {
    render(<FootballOverview department={null} activeSeason={null} teamSeasons={[]} />);
    expect(screen.getByText(/noch keine fußballabteilung/i)).toBeInTheDocument();
  });

  it("shows the active season name and date range", () => {
    render(<FootballOverview department={baseDepartment} activeSeason={baseSeason} teamSeasons={[]} />);
    expect(screen.getByText(/2026\/2027/)).toBeInTheDocument();
  });

  it("shows a message when there is no active season", () => {
    render(<FootballOverview department={baseDepartment} activeSeason={null} teamSeasons={[]} />);
    expect(screen.getAllByText(/keine aktive saison/i).length).toBeGreaterThan(0);
  });

  it("shows teams with their age group", () => {
    render(
      <FootballOverview
        department={baseDepartment}
        activeSeason={baseSeason}
        teamSeasons={[
          { id: "ts1", teamId: "t1", teamName: "E1", ageGroupName: "E-Jugend", displayName: null },
        ]}
      />,
    );
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("E-Jugend")).toBeInTheDocument();
  });

  it("prefers displayName over teamName when set", () => {
    render(
      <FootballOverview
        department={baseDepartment}
        activeSeason={baseSeason}
        teamSeasons={[
          { id: "ts1", teamId: "t1", teamName: "E1", ageGroupName: "E-Jugend", displayName: "E1 (neu)" },
        ]}
      />,
    );
    expect(screen.getByText("E1 (neu)")).toBeInTheDocument();
    expect(screen.queryByText("E1")).not.toBeInTheDocument();
  });

  it("shows an empty state for teams when there is an active season but no team seasons", () => {
    render(<FootballOverview department={baseDepartment} activeSeason={baseSeason} teamSeasons={[]} />);
    expect(screen.getByText(/noch keine mannschaften für diese saison/i)).toBeInTheDocument();
  });

  it("hides the season management link without permission", () => {
    render(<FootballOverview department={baseDepartment} activeSeason={baseSeason} teamSeasons={[]} />);
    expect(screen.queryByText(/saisons verwalten/i)).not.toBeInTheDocument();
  });

  it("shows the season management link with permission", () => {
    render(
      <FootballOverview
        department={{ ...baseDepartment, canManage: true }}
        activeSeason={baseSeason}
        teamSeasons={[]}
      />,
    );
    expect(screen.getByText(/saisons verwalten/i)).toBeInTheDocument();
  });
});
