import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatisticsTeamSeasonList } from "../statistics-team-season-list";

describe("StatisticsTeamSeasonList", () => {
  it("shows an empty state when no team season is available", () => {
    render(<StatisticsTeamSeasonList teamSeasons={[]} />);
    expect(screen.getByText(/keine mannschaft verfügbar/i)).toBeInTheDocument();
  });

  it("lists team seasons with team name and age group", () => {
    render(
      <StatisticsTeamSeasonList
        teamSeasons={[{ id: "ts1", teamName: "E1", ageGroupName: "E-Jugend" }]}
      />,
    );
    expect(screen.getByText(/E1 \(E-Jugend\)/)).toBeInTheDocument();
  });

  it("links each entry to its statistics detail page", () => {
    render(
      <StatisticsTeamSeasonList
        teamSeasons={[{ id: "ts1", teamName: "E1", ageGroupName: "E-Jugend" }]}
      />,
    );
    expect(screen.getByRole("link", { name: /E1/ })).toHaveAttribute("href", "/statistik/ts1");
  });

  it("renders multiple team seasons", () => {
    render(
      <StatisticsTeamSeasonList
        teamSeasons={[
          { id: "ts1", teamName: "E1", ageGroupName: "E-Jugend" },
          { id: "ts2", teamName: "D1", ageGroupName: "D-Jugend" },
        ]}
      />,
    );
    expect(screen.getAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/statistik/"))).toHaveLength(2);
  });
});
