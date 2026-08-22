import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createPersonAction: vi.fn(),
  updatePersonAction: vi.fn(() => vi.fn()),
  grantRoleAction: vi.fn(() => vi.fn()),
  revokeRoleAction: vi.fn(() => vi.fn()),
  inviteAccountAction: vi.fn(() => vi.fn()),
  revokeInvitationAction: vi.fn(() => vi.fn()),
  createRelationshipAction: vi.fn(() => vi.fn()),
  revokeRelationshipAction: vi.fn(() => vi.fn()),
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

describe("PersonManagement — Account", () => {
  it("hides the account section when invitations are not provided", () => {
    render(<PersonManagement persons={persons} canCreate={false} departments={[]} teams={[]} />);
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
  });

  it("shows 'Account verknüpft' when an invitation was accepted", () => {
    render(
      <PersonManagement
        persons={[
          {
            id: "p1",
            firstName: "Max",
            lastName: "Mustermann",
            canEdit: true,
            invitations: [{ id: "i1", email: "max@example.invalid", status: "ACCEPTED" }],
          },
        ]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByText("Account verknüpft")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account einladen" })).not.toBeInTheDocument();
  });

  it("shows the pending status and a resend/revoke option for a PENDING invitation", () => {
    render(
      <PersonManagement
        persons={[
          {
            id: "p1",
            firstName: "Max",
            lastName: "Mustermann",
            canEdit: true,
            invitations: [{ id: "i1", email: "max@example.invalid", status: "PENDING" }],
          },
        ]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByText(/wartet auf annahme/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut senden" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Widerrufen" })).toBeInTheDocument();
  });

  it("shows an invite form with no prior invitation", () => {
    render(
      <PersonManagement
        persons={[
          { id: "p1", firstName: "Max", lastName: "Mustermann", canEdit: true, invitations: [] },
        ]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByLabelText(/e-mail-adresse für einladung/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account einladen" })).toBeInTheDocument();
  });
});

describe("PersonManagement — Beziehungen", () => {
  it("hides the relationships section when not provided", () => {
    render(<PersonManagement persons={persons} canCreate={false} departments={[]} teams={[]} />);
    expect(screen.queryByText("Beziehungen")).not.toBeInTheDocument();
  });

  it("shows an empty state without relationships", () => {
    render(
      <PersonManagement
        persons={[
          { id: "p1", firstName: "Max", lastName: "Mustermann", canEdit: true, relationships: [] },
        ]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByText(/keine beziehungen hinterlegt/i)).toBeInTheDocument();
  });

  it("shows a guardian relationship with German labels in both directions", () => {
    render(
      <PersonManagement
        persons={[
          {
            id: "p1",
            firstName: "Anna",
            lastName: "Mustermann",
            canEdit: true,
            relationships: [
              {
                id: "rel1",
                type: "LEGAL_GUARDIAN",
                direction: "AS_GUARDIAN",
                otherPersonId: "p2",
                otherPersonFirstName: "Max",
                otherPersonLastName: "Mustermann",
              },
            ],
          },
          { id: "p2", firstName: "Max", lastName: "Mustermann", canEdit: false },
        ]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByText("Erziehungsberechtigter von Max Mustermann")).toBeInTheDocument();
  });

  it("shows the add-relationship form with a person picker and type picker", () => {
    render(
      <PersonManagement
        persons={[
          { id: "p1", firstName: "Anna", lastName: "Mustermann", canEdit: true, relationships: [] },
          { id: "p2", firstName: "Max", lastName: "Mustermann", canEdit: false },
        ]}
        canCreate={true}
        departments={[]}
        teams={[]}
      />,
    );
    expect(screen.getByLabelText("Person auswählen")).toBeInTheDocument();
    expect(screen.getByLabelText("Beziehungstyp")).toBeInTheDocument();
  });
});
