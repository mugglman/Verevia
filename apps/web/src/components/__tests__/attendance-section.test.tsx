import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  setEventRsvpAction: vi.fn(() => vi.fn()),
  markEventAttendedAction: vi.fn(() => vi.fn()),
}));

import { AttendanceSection } from "../attendance-section";

describe("AttendanceSection", () => {
  it("shows an empty state when there are no roster entries", () => {
    render(<AttendanceSection eventId="event-1" items={[]} canManageAttendance={false} />);
    expect(screen.getByText(/keine personen zugeordnet/i)).toBeInTheDocument();
  });

  it("shows RSVP status and no action buttons for a row that is neither self nor manageable", () => {
    render(
      <AttendanceSection
        eventId="event-1"
        items={[{ personId: "p1", personName: "Max Mustermann", rsvpStatus: "DECLINED", rsvpNote: null, attended: null, isSelfOrGuardianTarget: false }]}
        canManageAttendance={false}
      />,
    );
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("Abgesagt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zusagen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "War da" })).not.toBeInTheDocument();
  });

  it("shows Zusagen/Absagen buttons only for a self-or-guardian-target row", () => {
    render(
      <AttendanceSection
        eventId="event-1"
        items={[{ personId: "p1", personName: "Max Mustermann", rsvpStatus: "PENDING", rsvpNote: null, attended: null, isSelfOrGuardianTarget: true }]}
        canManageAttendance={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Zusagen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Absagen" })).toBeInTheDocument();
  });

  it("shows War da/War nicht da buttons for every row when canManageAttendance is true", () => {
    render(
      <AttendanceSection
        eventId="event-1"
        items={[{ personId: "p1", personName: "Max Mustermann", rsvpStatus: "PENDING", rsvpNote: null, attended: null, isSelfOrGuardianTarget: false }]}
        canManageAttendance={true}
      />,
    );
    expect(screen.getByRole("button", { name: "War da" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "War nicht da" })).toBeInTheDocument();
  });

  it("shows the actual attendance note alongside the RSVP status once recorded", () => {
    render(
      <AttendanceSection
        eventId="event-1"
        items={[{ personId: "p1", personName: "Max Mustermann", rsvpStatus: "ACCEPTED", rsvpNote: null, attended: true, isSelfOrGuardianTarget: false }]}
        canManageAttendance={false}
      />,
    );
    expect(screen.getByText(/war anwesend/i)).toBeInTheDocument();
  });
});
