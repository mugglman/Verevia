import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createEventAction: vi.fn(),
}));

import { EventCreateForm } from "../event-create-form";

describe("EventCreateForm", () => {
  it("shows an empty state when no team or department is available", () => {
    render(<EventCreateForm teams={[]} departments={[]} venues={[]} />);
    expect(screen.getByText(/keine mannschaft oder abteilung verfügbar/i)).toBeInTheDocument();
  });

  it("renders the form fields when a team is available", () => {
    render(<EventCreateForm teams={[{ id: "team-1", name: "E1" }]} departments={[]} venues={[{ id: "venue-1", name: "Sportplatz Benediktbeuern" }]} />);
    expect(screen.getByLabelText(/für wen/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^titel$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^art$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^beginn$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^ende$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^ort$/i)).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("Sportplatz Benediktbeuern")).toBeInTheDocument();
  });

  it("renders both teams and departments as scope options when both are available", () => {
    render(<EventCreateForm teams={[{ id: "team-1", name: "E1" }]} departments={[{ id: "dept-1", name: "Fußball" }]} venues={[]} />);
    const scopeSelect = screen.getByLabelText(/für wen/i);
    expect(scopeSelect).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("Fußball")).toBeInTheDocument();
  });

  it("does not expose technical IDs in visible text", () => {
    render(<EventCreateForm teams={[{ id: "team-1", name: "E1" }]} departments={[]} venues={[]} />);
    expect(screen.queryByText(/team-1/)).not.toBeInTheDocument();
  });
});
