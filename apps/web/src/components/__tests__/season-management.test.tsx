import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createSeasonAction: vi.fn(() => vi.fn()),
  updateSeasonAction: vi.fn(() => vi.fn()),
}));

import { SeasonManagement } from "../season-management";

const baseSeason = {
  id: "season-1",
  name: "2026/2027",
  startsAt: "2026-08-01T00:00:00.000Z",
  endsAt: "2027-06-30T00:00:00.000Z",
  status: "ACTIVE" as const,
  canEdit: false,
};

describe("SeasonManagement", () => {
  it("shows the department name in the heading", () => {
    render(
      <SeasonManagement departmentId="dept-1" departmentName="Fußball" canCreate={false} seasons={[]} />,
    );
    expect(screen.getByText(/saisons – fußball/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no seasons", () => {
    render(
      <SeasonManagement departmentId="dept-1" departmentName="Fußball" canCreate={false} seasons={[]} />,
    );
    expect(screen.getByText(/noch keine saisons vorhanden/i)).toBeInTheDocument();
  });

  it("shows season name and status label", () => {
    render(
      <SeasonManagement
        departmentId="dept-1"
        departmentName="Fußball"
        canCreate={false}
        seasons={[baseSeason]}
      />,
    );
    expect(screen.getByText("2026/2027")).toBeInTheDocument();
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
  });

  it("hides the edit form without permission", () => {
    render(
      <SeasonManagement
        departmentId="dept-1"
        departmentName="Fußball"
        canCreate={false}
        seasons={[baseSeason]}
      />,
    );
    expect(screen.queryByLabelText("Saisonname")).not.toBeInTheDocument();
  });

  it("shows the edit form with permission", () => {
    render(
      <SeasonManagement
        departmentId="dept-1"
        departmentName="Fußball"
        canCreate={false}
        seasons={[{ ...baseSeason, canEdit: true }]}
      />,
    );
    expect(screen.getByLabelText("Saisonname")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });

  it("hides the create form without permission", () => {
    render(
      <SeasonManagement departmentId="dept-1" departmentName="Fußball" canCreate={false} seasons={[]} />,
    );
    expect(screen.queryByLabelText(/name der neuen saison/i)).not.toBeInTheDocument();
  });

  it("shows the create form with permission", () => {
    render(
      <SeasonManagement departmentId="dept-1" departmentName="Fußball" canCreate={true} seasons={[]} />,
    );
    expect(screen.getByLabelText(/name der neuen saison/i)).toBeInTheDocument();
  });
});
