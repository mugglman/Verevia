import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createTournamentAction: vi.fn(() => vi.fn()),
}));

import { TournamentCreateForm } from "../tournament-create-form";

describe("TournamentCreateForm", () => {
  it("renders the required fields", () => {
    render(<TournamentCreateForm departmentId="dept-1" seasons={[]} />);
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/beschreibung/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^beginn$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ende \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^modus$/i)).toBeInTheDocument();
  });

  it("does not render a season select when no seasons are available", () => {
    render(<TournamentCreateForm departmentId="dept-1" seasons={[]} />);
    expect(screen.queryByLabelText(/^saison$/i)).not.toBeInTheDocument();
  });

  it("renders a season select when seasons are available", () => {
    render(<TournamentCreateForm departmentId="dept-1" seasons={[{ id: "season-1", name: "2026/2027" }]} />);
    expect(screen.getByLabelText(/^saison$/i)).toBeInTheDocument();
    expect(screen.getByText("2026/2027")).toBeInTheDocument();
  });

  it("does not expose technical IDs in visible text", () => {
    render(<TournamentCreateForm departmentId="dept-1" seasons={[{ id: "season-1", name: "2026/2027" }]} />);
    expect(screen.queryByText(/dept-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/season-1/)).not.toBeInTheDocument();
  });
});
