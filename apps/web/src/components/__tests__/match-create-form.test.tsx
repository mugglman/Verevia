import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createMatchAction: vi.fn(),
}));

import { MatchCreateForm } from "../match-create-form";

describe("MatchCreateForm", () => {
  it("shows an empty state when no team season is available", () => {
    render(<MatchCreateForm teamSeasons={[]} venues={[]} />);
    expect(screen.getByText(/keine mannschaft verfügbar/i)).toBeInTheDocument();
  });

  it("renders the form fields when a team season is available", () => {
    render(
      <MatchCreateForm
        teamSeasons={[{ id: "ts-1", teamName: "E1", ageGroupName: "E-Jugend" }]}
        venues={[{ id: "venue-1", name: "Sportplatz Benediktbeuern" }]}
      />,
    );
    expect(screen.getByLabelText(/mannschaft/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^gegner$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/datum und uhrzeit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/heim\/auswärts/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/spielstätte/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/spieltyp/i)).toBeInTheDocument();
    expect(screen.getByText("E1 (E-Jugend)")).toBeInTheDocument();
    expect(screen.getByText("Sportplatz Benediktbeuern")).toBeInTheDocument();
  });

  it("does not expose technical IDs in visible text", () => {
    render(
      <MatchCreateForm
        teamSeasons={[{ id: "ts-1", teamName: "E1", ageGroupName: "E-Jugend" }]}
        venues={[]}
      />,
    );
    expect(screen.queryByText(/ts-1/)).not.toBeInTheDocument();
  });
});
