import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  grantRoleAction: vi.fn(() => vi.fn()),
}));

import { AddRoleForm } from "../add-role-form";

const departments = [{ id: "d1", name: "Fußball" }];
const teams = [{ id: "t1", name: "E1" }];

describe("AddRoleForm", () => {
  it("shows the role picker", () => {
    render(<AddRoleForm personId="p1" departments={departments} teams={teams} />);
    expect(screen.getByLabelText("Rolle")).toBeInTheDocument();
  });

  it("shows the Mannschaft picker after selecting a TEAM-scoped role", () => {
    render(<AddRoleForm personId="p1" departments={departments} teams={teams} />);
    fireEvent.change(screen.getByLabelText("Rolle"), { target: { value: "COACH" } });
    expect(screen.getByLabelText("Mannschaft auswählen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Abteilung auswählen")).not.toBeInTheDocument();
  });

  it("shows the Abteilung picker for a DEPARTMENT-scoped role", () => {
    render(<AddRoleForm personId="p1" departments={departments} teams={teams} />);
    fireEvent.change(screen.getByLabelText("Rolle"), { target: { value: "DEPARTMENT_ADMIN" } });
    expect(screen.getByLabelText("Abteilung auswählen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mannschaft auswählen")).not.toBeInTheDocument();
  });

  it("shows neither picker for a TENANT-scoped role", () => {
    render(<AddRoleForm personId="p1" departments={departments} teams={teams} />);
    fireEvent.change(screen.getByLabelText("Rolle"), { target: { value: "TENANT_ADMIN" } });
    expect(screen.queryByLabelText("Abteilung auswählen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mannschaft auswählen")).not.toBeInTheDocument();
  });
});
