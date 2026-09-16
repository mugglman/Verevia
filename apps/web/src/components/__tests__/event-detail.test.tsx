import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  updateEventAction: vi.fn(() => vi.fn()),
  deleteEventAction: vi.fn(() => vi.fn()),
  setEventRsvpAction: vi.fn(() => vi.fn()),
  markEventAttendedAction: vi.fn(() => vi.fn()),
}));

import { EventDetail } from "../event-detail";

const baseEvent = {
  id: "event-1",
  title: "Training E1",
  description: null,
  type: "TRAINING" as const,
  startsAt: "2026-09-10T17:00:00.000Z",
  endsAt: "2026-09-10T18:30:00.000Z",
  teamName: "E1",
  departmentName: null,
  seasonId: null,
  seasonName: null,
  venueId: "venue-1",
  venueName: "Sportplatz Benediktbeuern",
  canEdit: false,
};

const venues = [{ id: "venue-1", name: "Sportplatz Benediktbeuern" }];

describe("EventDetail", () => {
  it("shows a read-only view without permission", () => {
    render(<EventDetail event={baseEvent} venues={venues} attendanceItems={[]} canManageAttendance={false} />);
    expect(screen.getByText(/sportplatz benediktbeuern/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^titel$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/termin löschen/i)).not.toBeInTheDocument();
  });

  it("shows the edit form and a delete button with permission", () => {
    render(<EventDetail event={{ ...baseEvent, canEdit: true }} venues={venues} attendanceItems={[]} canManageAttendance={false} />);
    expect(screen.getByLabelText(/^titel$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^art$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^beginn$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^ende$/i)).toBeInTheDocument();
    expect(screen.getByText(/termin löschen/i)).toBeInTheDocument();
  });

  it("shows the type badge even while editing", () => {
    render(<EventDetail event={{ ...baseEvent, canEdit: true }} venues={venues} attendanceItems={[]} canManageAttendance={false} />);
    expect(screen.getAllByText("Training").length).toBeGreaterThan(0);
  });

  it("shows the season when set and read-only", () => {
    render(
      <EventDetail
        event={{ ...baseEvent, seasonId: "season-1", seasonName: "2026/2027" }}
        venues={venues}
        attendanceItems={[]}
        canManageAttendance={false}
      />,
    );
    expect(screen.getByText(/2026\/2027/)).toBeInTheDocument();
  });

  it("falls back to the department name when there is no team", () => {
    render(
      <EventDetail
        event={{ ...baseEvent, teamName: null, departmentName: "Fußball" }}
        venues={venues}
        attendanceItems={[]}
        canManageAttendance={false}
      />,
    );
    expect(screen.getByText(/fußball/i)).toBeInTheDocument();
  });

  it("renders the attendance section with roster entries", () => {
    render(
      <EventDetail
        event={baseEvent}
        venues={venues}
        attendanceItems={[
          { personId: "p1", personName: "Max Mustermann", rsvpStatus: "ACCEPTED", rsvpNote: null, attended: null, isSelfOrGuardianTarget: false },
        ]}
        canManageAttendance={false}
      />,
    );
    expect(screen.getByText("Anwesenheit")).toBeInTheDocument();
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("Zugesagt")).toBeInTheDocument();
  });

  it("shows organizer attendance controls only when canManageAttendance is true", () => {
    render(
      <EventDetail
        event={{ ...baseEvent, canEdit: true }}
        venues={venues}
        attendanceItems={[
          { personId: "p1", personName: "Max Mustermann", rsvpStatus: "PENDING", rsvpNote: null, attended: null, isSelfOrGuardianTarget: false },
        ]}
        canManageAttendance={true}
      />,
    );
    expect(screen.getByRole("button", { name: "War da" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "War nicht da" })).toBeInTheDocument();
  });
});
