import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createTaskAction: vi.fn(),
}));

import { TaskCreateForm } from "../task-create-form";

describe("TaskCreateForm", () => {
  it("shows an empty state when no team or person is available", () => {
    render(<TaskCreateForm teams={[]} persons={[]} />);
    expect(screen.getByText(/keine mannschaft oder person verfügbar/i)).toBeInTheDocument();
  });

  it("renders the form fields when a team is available", () => {
    render(<TaskCreateForm teams={[{ id: "team-1", name: "E1" }]} persons={[]} />);
    expect(screen.getByLabelText(/für wen/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^titel$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fällig am/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/beschreibung/i)).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
  });

  it("renders both teams and persons as scope options when both are available", () => {
    render(<TaskCreateForm teams={[{ id: "team-1", name: "E1" }]} persons={[{ id: "person-1", name: "Max Mustermann" }]} />);
    expect(screen.getByLabelText(/für wen/i)).toBeInTheDocument();
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
  });

  it("does not expose technical IDs in visible text", () => {
    render(<TaskCreateForm teams={[{ id: "team-1", name: "E1" }]} persons={[]} />);
    expect(screen.queryByText(/team-1/)).not.toBeInTheDocument();
  });
});
