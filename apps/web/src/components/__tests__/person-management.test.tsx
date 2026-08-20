import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createPersonAction: vi.fn(),
  updatePersonAction: vi.fn(() => vi.fn()),
  grantRoleAction: vi.fn(() => vi.fn()),
  revokeRoleAction: vi.fn(() => vi.fn()),
}));

import { PersonManagement } from "../person-management";

const persons = [
  { id: "p1", firstName: "Max", lastName: "Mustermann", canEdit: false },
  { id: "p2", firstName: "Erika", lastName: "Musterfrau", canEdit: false },
];

describe("PersonManagement", () => {
  it("shows person names", () => {
    render(
      <PersonManagement persons={persons} canCreate={false} departments={[]} teams={[]} />,
    );
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("Erika Musterfrau")).toBeInTheDocument();
  });

  it("shows an empty state without persons", () => {
    render(<PersonManagement persons={[]} canCreate={false} departments={[]} teams={[]} />);
    expect(screen.getByText(/noch keine personen/i)).toBeInTheDocument();
  });

  it("hides the create form without permission", () => {
    render(<PersonManagement persons={[]} canCreate={false} departments={[]} teams={[]} />);
    expect(screen.queryByLabelText(/vorname der neuen person/i)).not.toBeInTheDocument();
  });

  it("shows the create form with permission", () => {
    render(<PersonManagement persons={[]} canCreate={true} departments={[]} teams={[]} />);
    expect(screen.getByLabelText(/vorname der neuen person/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nachname der neuen person/i)).toBeInTheDocument();
  });

  it("hides edit forms for persons without permission", () => {
    render(
      <PersonManagement persons={persons} canCreate={false} departments={[]} teams={[]} />,
    );
    expect(screen.queryByLabelText("Vorname")).not.toBeInTheDocument();
  });

  it("shows edit forms for persons with permission", () => {
    render(
      <PersonManagement
        persons={[{ id: "p1", firstName: "Max", lastName: "Mustermann", canEdit: true }]}
        canCreate={false}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByLabelText("Vorname")).toBeInTheDocument();
    expect(screen.getByLabelText("Nachname")).toBeInTheDocument();
  });

  it("hides the roles section when roles are not provided (viewer cannot manage roles)", () => {
    render(
      <PersonManagement persons={persons} canCreate={false} departments={[]} teams={[]} />,
    );
    expect(screen.queryByText(/rollen.*berechtigungen/i)).not.toBeInTheDocument();
  });

  it("shows the roles section and formatted role labels when roles are provided", () => {
    render(
      <PersonManagement
        persons={[
          {
            id: "p1",
            firstName: "Max",
            lastName: "Mustermann",
            canEdit: true,
            roles: [
              { id: "r1", role: "COACH", departmentName: null, teamName: "E1" },
              { id: "r2", role: "DEPARTMENT_ADMIN", departmentName: "Fußball", teamName: null },
            ],
          },
        ]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByText(/rollen.*berechtigungen/i)).toBeInTheDocument();
    expect(screen.getByText("Trainer E1")).toBeInTheDocument();
    expect(screen.getByText("Abteilungsleiter Fußball")).toBeInTheDocument();
  });

  it("shows an empty-roles hint when the roles array is empty", () => {
    render(
      <PersonManagement
        persons={[{ id: "p1", firstName: "Max", lastName: "Mustermann", canEdit: true, roles: [] }]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByText(/keine rollen zugewiesen/i)).toBeInTheDocument();
  });

  it("protects the last TENANT_ADMIN from removal in the UI", () => {
    render(
      <PersonManagement
        persons={[
          {
            id: "p1",
            firstName: "Max",
            lastName: "Mustermann",
            canEdit: true,
            roles: [
              {
                id: "r1",
                role: "TENANT_ADMIN",
                departmentName: null,
                teamName: null,
                isLastTenantAdmin: true,
              },
            ],
          },
        ]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByText(/letzter vereinsadministrator/i)).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Vereinsadministrator entfernen"),
    ).not.toBeInTheDocument();
  });

  it("allows removing a TENANT_ADMIN role that is not the last one", () => {
    render(
      <PersonManagement
        persons={[
          {
            id: "p1",
            firstName: "Max",
            lastName: "Mustermann",
            canEdit: true,
            roles: [
              {
                id: "r1",
                role: "TENANT_ADMIN",
                departmentName: null,
                teamName: null,
                isLastTenantAdmin: false,
              },
            ],
          },
        ]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByLabelText("Vereinsadministrator entfernen")).toBeInTheDocument();
  });
});
