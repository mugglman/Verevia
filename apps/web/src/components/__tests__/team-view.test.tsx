import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  updateClubNameAction: vi.fn(),
  createDepartmentAction: vi.fn(),
  updateDepartmentNameAction: vi.fn(),
  createTeamAction: vi.fn(),
  updateTeamNameAction: vi.fn(),
  addTeamMemberAction: vi.fn(() => vi.fn()),
  removeTeamMemberAction: vi.fn(() => vi.fn()),
}));

import { TeamView } from "../team-view";

const baseTeam = { id: "t1", name: "E1", departmentId: "d1", canEdit: false };
const members = [
  { personId: "p1", firstName: "Max", lastName: "Mustermann" },
  { personId: "p2", firstName: "Erika", lastName: "Musterfrau" },
];

describe("TeamView", () => {
  it("shows the team name", () => {
    render(
      <TeamView
        team={baseTeam}
        departmentName="Fußball"
        members={[]}
        canManageMembers={false}
      />,
    );
    expect(screen.getAllByText("E1").length).toBeGreaterThan(0);
  });

  it("shows the department breadcrumb when known", () => {
    render(
      <TeamView
        team={baseTeam}
        departmentName="Fußball"
        members={[]}
        canManageMembers={false}
      />,
    );
    expect(screen.getByText("Fußball")).toBeInTheDocument();
  });

  it("hides the edit form without permission", () => {
    render(
      <TeamView
        team={baseTeam}
        departmentName="Fußball"
        members={[]}
        canManageMembers={false}
      />,
    );
    expect(screen.queryByLabelText("Mannschaftsname")).not.toBeInTheDocument();
  });

  it("shows the edit form with permission", () => {
    render(
      <TeamView
        team={{ ...baseTeam, canEdit: true }}
        departmentName="Fußball"
        members={[]}
        canManageMembers={false}
      />,
    );
    expect(screen.getByLabelText("Mannschaftsname")).toBeInTheDocument();
  });

  it("shows an empty state without members", () => {
    render(
      <TeamView
        team={baseTeam}
        departmentName="Fußball"
        members={[]}
        canManageMembers={false}
      />,
    );
    expect(screen.getByText(/noch keine mitglieder/i)).toBeInTheDocument();
  });

  it("shows member names", () => {
    render(
      <TeamView
        team={baseTeam}
        departmentName="Fußball"
        members={members}
        canManageMembers={false}
      />,
    );
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("Erika Musterfrau")).toBeInTheDocument();
  });

  it("hides remove buttons and the add form without permission", () => {
    render(
      <TeamView
        team={baseTeam}
        departmentName="Fußball"
        members={members}
        canManageMembers={false}
      />,
    );
    expect(
      screen.queryByLabelText("Max Mustermann entfernen"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Person hinzufügen")).not.toBeInTheDocument();
  });

  it("shows remove buttons and the add form with permission", () => {
    render(
      <TeamView
        team={baseTeam}
        departmentName="Fußball"
        members={members}
        canManageMembers={true}
        candidatePersons={[{ id: "p3", firstName: "Anna", lastName: "Beispiel" }]}
      />,
    );
    expect(screen.getByLabelText("Max Mustermann entfernen")).toBeInTheDocument();
    expect(screen.getByLabelText("Person hinzufügen")).toBeInTheDocument();
  });
});
