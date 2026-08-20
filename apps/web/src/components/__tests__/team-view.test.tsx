import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  updateClubNameAction: vi.fn(),
  createDepartmentAction: vi.fn(),
  updateDepartmentNameAction: vi.fn(),
  createTeamAction: vi.fn(),
  updateTeamNameAction: vi.fn(),
}));

import { TeamView } from "../team-view";

const baseTeam = { id: "t1", name: "E1", departmentId: "d1", canEdit: false };

describe("TeamView", () => {
  it("shows the team name", () => {
    render(<TeamView team={baseTeam} departmentName="Fußball" />);
    expect(screen.getAllByText("E1").length).toBeGreaterThan(0);
  });

  it("shows the department breadcrumb when known", () => {
    render(<TeamView team={baseTeam} departmentName="Fußball" />);
    expect(screen.getByText("Fußball")).toBeInTheDocument();
  });

  it("hides the edit form without permission", () => {
    render(<TeamView team={baseTeam} departmentName="Fußball" />);
    expect(screen.queryByLabelText("Mannschaftsname")).not.toBeInTheDocument();
  });

  it("shows the edit form with permission", () => {
    render(<TeamView team={{ ...baseTeam, canEdit: true }} departmentName="Fußball" />);
    expect(screen.getByLabelText("Mannschaftsname")).toBeInTheDocument();
  });
});
