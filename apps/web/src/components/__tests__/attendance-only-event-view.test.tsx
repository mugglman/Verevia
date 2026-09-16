import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  setEventRsvpAction: vi.fn(() => vi.fn()),
  markEventAttendedAction: vi.fn(() => vi.fn()),
}));

import { AttendanceOnlyEventView } from "../attendance-only-event-view";

const baseEvent = {
  id: "event-1",
  title: "Training E1",
  description: "Bitte Schienbeinschoner mitbringen.",
  type: "TRAINING" as const,
  startsAt: "2026-09-10T17:00:00.000Z",
  endsAt: "2026-09-10T18:30:00.000Z",
  teamName: "E1",
  departmentName: null,
  venueName: "Sportplatz Benediktbeuern",
};

describe("AttendanceOnlyEventView", () => {
  it("shows the event's title, venue, and description, but no edit affordances", () => {
    render(<AttendanceOnlyEventView event={baseEvent} items={[]} canManageAttendance={false} />);
    expect(screen.getByRole("heading", { name: "Training E1" })).toBeInTheDocument();
    expect(screen.getByText(/sportplatz benediktbeuern/i)).toBeInTheDocument();
    expect(screen.getByText(/schienbeinschoner/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^titel$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/termin löschen/i)).not.toBeInTheDocument();
  });

  it("falls back to the department name when there is no team", () => {
    render(<AttendanceOnlyEventView event={{ ...baseEvent, teamName: null, departmentName: "Fußball" }} items={[]} canManageAttendance={false} />);
    expect(screen.getByText(/fußball/i)).toBeInTheDocument();
  });

  it("renders the attendance section with a self-service RSVP row", () => {
    render(
      <AttendanceOnlyEventView
        event={baseEvent}
        items={[{ personId: "child-1", personName: "E2E Kind", rsvpStatus: "PENDING", rsvpNote: null, attended: null, isSelfOrGuardianTarget: true }]}
        canManageAttendance={false}
      />,
    );
    expect(screen.getByText("E2E Kind")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zusagen" })).toBeInTheDocument();
  });
});
