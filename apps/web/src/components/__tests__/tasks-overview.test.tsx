import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TasksOverview } from "../tasks-overview";

const baseTask = {
  id: "task-1",
  title: "Trikots waschen",
  teamName: "E1",
  personName: null,
  dueAt: "2026-10-01T00:00:00.000Z",
  status: "OPEN" as const,
};

describe("TasksOverview", () => {
  it("shows an empty state when there are no tasks", () => {
    render(<TasksOverview tasks={[]} canCreate={false} />);
    expect(screen.getByText(/noch keine aufgaben angelegt/i)).toBeInTheDocument();
  });

  it("shows the title, team, due date, and status", () => {
    render(<TasksOverview tasks={[baseTask]} canCreate={false} />);
    expect(screen.getByText("Trikots waschen")).toBeInTheDocument();
    expect(screen.getByText(/e1 · fällig am/i)).toBeInTheDocument();
    expect(screen.getByText("Offen")).toBeInTheDocument();
  });

  it("shows the DONE status label", () => {
    render(<TasksOverview tasks={[{ ...baseTask, status: "DONE" }]} canCreate={false} />);
    expect(screen.getByText("Erledigt")).toBeInTheDocument();
  });

  it("falls back to the person name when there is no team", () => {
    render(<TasksOverview tasks={[{ ...baseTask, teamName: null, personName: "Max Mustermann" }]} canCreate={false} />);
    expect(screen.getByText(/max mustermann/i)).toBeInTheDocument();
  });

  it("hides the create link without permission", () => {
    render(<TasksOverview tasks={[]} canCreate={false} />);
    expect(screen.queryByText(/aufgabe anlegen/i)).not.toBeInTheDocument();
  });

  it("shows the create link with permission", () => {
    render(<TasksOverview tasks={[]} canCreate={true} />);
    expect(screen.getByText(/aufgabe anlegen/i)).toBeInTheDocument();
  });

  it("links each task to its detail page", () => {
    render(<TasksOverview tasks={[baseTask]} canCreate={false} />);
    expect(screen.getByRole("link", { name: /trikots waschen/i })).toHaveAttribute("href", "/aufgaben/task-1");
  });
});
