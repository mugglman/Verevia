import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  updateTaskAction: vi.fn(() => vi.fn()),
  deleteTaskAction: vi.fn(() => vi.fn()),
  setTaskStatusAction: vi.fn(() => vi.fn()),
}));

import { TaskDetail } from "../task-detail";

const baseTask = {
  id: "task-1",
  title: "Trikots waschen",
  description: "Bitte bis Freitag",
  dueAt: "2026-10-01T00:00:00.000Z",
  status: "OPEN" as const,
  teamName: "E1",
  personName: null,
  canEdit: false,
  canSetStatus: false,
};

describe("TaskDetail", () => {
  it("shows a read-only view without any permission", () => {
    render(<TaskDetail task={baseTask} />);
    expect(screen.getByText(/bitte bis freitag/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^titel$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/aufgabe löschen/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /als erledigt markieren/i })).not.toBeInTheDocument();
  });

  it("shows the edit form and a delete button with canEdit", () => {
    render(<TaskDetail task={{ ...baseTask, canEdit: true }} />);
    expect(screen.getByLabelText(/^titel$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fällig am/i)).toBeInTheDocument();
    expect(screen.getByText(/aufgabe löschen/i)).toBeInTheDocument();
  });

  it("shows 'Als erledigt markieren' for an OPEN task with canSetStatus", () => {
    render(<TaskDetail task={{ ...baseTask, canSetStatus: true }} />);
    expect(screen.getByRole("button", { name: /als erledigt markieren/i })).toBeInTheDocument();
  });

  it("shows 'Wieder öffnen' for a DONE task with canSetStatus", () => {
    render(<TaskDetail task={{ ...baseTask, status: "DONE", canSetStatus: true }} />);
    expect(screen.getByRole("button", { name: /wieder öffnen/i })).toBeInTheDocument();
  });

  it("falls back to the person name when there is no team", () => {
    render(<TaskDetail task={{ ...baseTask, teamName: null, personName: "Max Mustermann" }} />);
    expect(screen.getByText(/max mustermann/i)).toBeInTheDocument();
  });

  it("shows the status badge", () => {
    render(<TaskDetail task={{ ...baseTask, status: "DONE" }} />);
    expect(screen.getByText("Erledigt")).toBeInTheDocument();
  });
});
