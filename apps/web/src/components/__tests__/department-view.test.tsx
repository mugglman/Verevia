import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  updateClubNameAction: vi.fn(),
  createDepartmentAction: vi.fn(),
  updateDepartmentNameAction: vi.fn(() => vi.fn()),
  createTeamAction: vi.fn(() => vi.fn()),
  updateTeamNameAction: vi.fn(() => vi.fn()),
}));

import { DepartmentView } from "../department-view";

const baseDepartment = { id: "d1", name: "Fußball", canEdit: false, canCreateTeams: false };

describe("DepartmentView", () => {
  it("shows the department name", () => {
    render(<DepartmentView department={baseDepartment} teams={[]} />);
    expect(screen.getAllByText("Fußball").length).toBeGreaterThan(0);
  });

  it("shows team names", () => {
    render(
      <DepartmentView
        department={baseDepartment}
        teams={[
          { id: "t1", name: "E1" },
          { id: "t2", name: "E2" },
        ]}
      />,
    );
    expect(screen.getByText("E1")).toBeInTheDocument();
    expect(screen.getByText("E2")).toBeInTheDocument();
  });

  it("shows an empty state when there are no teams", () => {
    render(<DepartmentView department={baseDepartment} teams={[]} />);
    expect(screen.getByText(/noch keine mannschaften/i)).toBeInTheDocument();
  });

  it("hides edit/create forms without permission", () => {
    render(<DepartmentView department={baseDepartment} teams={[]} />);
    expect(screen.queryByLabelText("Abteilungsname")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/name der neuen mannschaft/i)).not.toBeInTheDocument();
  });

  it("shows edit/create forms with permission", () => {
    render(
      <DepartmentView
        department={{ ...baseDepartment, canEdit: true, canCreateTeams: true }}
        teams={[]}
      />,
    );
    expect(screen.getByLabelText("Abteilungsname")).toBeInTheDocument();
    expect(screen.getByLabelText(/name der neuen mannschaft/i)).toBeInTheDocument();
  });
});
