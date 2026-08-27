import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createVenueAction: vi.fn(),
  updateVenueAction: vi.fn(() => vi.fn()),
}));

import { VenueManagement } from "../venue-management";

const baseVenue = {
  id: "venue-1",
  name: "Sportplatz Benediktbeuern",
  street: null,
  postalCode: null,
  city: null,
  status: "ACTIVE" as const,
  canEdit: false,
};

describe("VenueManagement", () => {
  it("shows an empty state when there are no venues", () => {
    render(<VenueManagement venues={[]} canCreate={false} />);
    expect(screen.getByText(/noch keine spielstätten angelegt/i)).toBeInTheDocument();
  });

  it("shows the venue name and status", () => {
    render(<VenueManagement venues={[baseVenue]} canCreate={false} />);
    expect(screen.getByText("Sportplatz Benediktbeuern")).toBeInTheDocument();
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
  });

  it("hides the edit form without permission", () => {
    render(<VenueManagement venues={[baseVenue]} canCreate={false} />);
    expect(screen.queryByLabelText("Name der Spielstätte")).not.toBeInTheDocument();
  });

  it("shows the edit form with permission", () => {
    render(<VenueManagement venues={[{ ...baseVenue, canEdit: true }]} canCreate={false} />);
    expect(screen.getByLabelText("Name der Spielstätte")).toBeInTheDocument();
  });

  it("hides the create form without permission", () => {
    render(<VenueManagement venues={[]} canCreate={false} />);
    expect(screen.queryByLabelText(/name der neuen spielstätte/i)).not.toBeInTheDocument();
  });

  it("shows the create form with permission", () => {
    render(<VenueManagement venues={[]} canCreate={true} />);
    expect(screen.getByLabelText(/name der neuen spielstätte/i)).toBeInTheDocument();
  });
});
