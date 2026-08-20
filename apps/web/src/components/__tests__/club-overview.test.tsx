import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  updateClubNameAction: vi.fn(),
  createDepartmentAction: vi.fn(),
  updateDepartmentNameAction: vi.fn(),
  createTeamAction: vi.fn(),
  updateTeamNameAction: vi.fn(),
}));

import { ClubOverview } from "../club-overview";

describe("ClubOverview", () => {
  it("shows the club name", () => {
    render(
      <ClubOverview
        club={{ id: "t1", name: "TSV Benediktbeuern", slug: "tsv-benediktbeuern", canEdit: false }}
        departments={[]}
        canCreateDepartment={false}
      />,
    );
    expect(screen.getByText("TSV Benediktbeuern")).toBeInTheDocument();
  });

  it("shows department names", () => {
    render(
      <ClubOverview
        club={{ id: "t1", name: "TSV Benediktbeuern", slug: "tsv-benediktbeuern", canEdit: false }}
        departments={[{ id: "d1", name: "Fußball", canEdit: false }]}
        canCreateDepartment={false}
      />,
    );
    expect(screen.getByText("Fußball")).toBeInTheDocument();
  });

  it("shows an empty state when there are no departments", () => {
    render(
      <ClubOverview
        club={{ id: "t1", name: "TSV Benediktbeuern", slug: "tsv-benediktbeuern", canEdit: false }}
        departments={[]}
        canCreateDepartment={false}
      />,
    );
    expect(screen.getByText(/noch keine abteilungen/i)).toBeInTheDocument();
  });

  it("hides the edit form when the user may not edit the club", () => {
    render(
      <ClubOverview
        club={{ id: "t1", name: "TSV Benediktbeuern", slug: "tsv-benediktbeuern", canEdit: false }}
        departments={[]}
        canCreateDepartment={false}
      />,
    );
    expect(screen.queryByLabelText("Vereinsname")).not.toBeInTheDocument();
  });

  it("shows the edit form when the user may edit the club", () => {
    render(
      <ClubOverview
        club={{ id: "t1", name: "TSV Benediktbeuern", slug: "tsv-benediktbeuern", canEdit: true }}
        departments={[]}
        canCreateDepartment={false}
      />,
    );
    expect(screen.getByLabelText("Vereinsname")).toBeInTheDocument();
  });

  it("hides the create-department form without permission", () => {
    render(
      <ClubOverview
        club={{ id: "t1", name: "TSV Benediktbeuern", slug: "tsv-benediktbeuern", canEdit: false }}
        departments={[]}
        canCreateDepartment={false}
      />,
    );
    expect(screen.queryByLabelText(/name der neuen abteilung/i)).not.toBeInTheDocument();
  });

  it("shows the create-department form with permission", () => {
    render(
      <ClubOverview
        club={{ id: "t1", name: "TSV Benediktbeuern", slug: "tsv-benediktbeuern", canEdit: false }}
        departments={[]}
        canCreateDepartment={true}
      />,
    );
    expect(screen.getByLabelText(/name der neuen abteilung/i)).toBeInTheDocument();
  });
});
