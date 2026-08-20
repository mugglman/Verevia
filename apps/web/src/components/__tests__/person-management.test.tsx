import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createPersonAction: vi.fn(),
  updatePersonAction: vi.fn(() => vi.fn()),
}));

import { PersonManagement } from "../person-management";

const persons = [
  { id: "p1", firstName: "Max", lastName: "Mustermann", canEdit: false },
  { id: "p2", firstName: "Erika", lastName: "Musterfrau", canEdit: false },
];

describe("PersonManagement", () => {
  it("shows person names", () => {
    render(<PersonManagement persons={persons} canCreate={false} />);
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("Erika Musterfrau")).toBeInTheDocument();
  });

  it("shows an empty state without persons", () => {
    render(<PersonManagement persons={[]} canCreate={false} />);
    expect(screen.getByText(/noch keine personen/i)).toBeInTheDocument();
  });

  it("hides the create form without permission", () => {
    render(<PersonManagement persons={[]} canCreate={false} />);
    expect(screen.queryByLabelText(/vorname der neuen person/i)).not.toBeInTheDocument();
  });

  it("shows the create form with permission", () => {
    render(<PersonManagement persons={[]} canCreate={true} />);
    expect(screen.getByLabelText(/vorname der neuen person/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nachname der neuen person/i)).toBeInTheDocument();
  });

  it("hides edit forms for persons without permission", () => {
    render(<PersonManagement persons={persons} canCreate={false} />);
    expect(screen.queryByLabelText("Vorname")).not.toBeInTheDocument();
  });

  it("shows edit forms for persons with permission", () => {
    render(
      <PersonManagement
        persons={[{ id: "p1", firstName: "Max", lastName: "Mustermann", canEdit: true }]}
        canCreate={false}
      />,
    );
    expect(screen.getByLabelText("Vorname")).toBeInTheDocument();
    expect(screen.getByLabelText("Nachname")).toBeInTheDocument();
  });
});
