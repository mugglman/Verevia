import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventsOverview } from "../events-overview";

const baseEvent = {
  id: "event-1",
  title: "Training E1",
  type: "TRAINING" as const,
  startsAt: "2026-09-10T17:00:00.000Z",
  endsAt: "2026-09-10T18:30:00.000Z",
  teamName: "E1",
  departmentName: null,
  venueName: "Sportplatz Benediktbeuern",
};

describe("EventsOverview", () => {
  it("shows an empty state when there are no events", () => {
    render(<EventsOverview events={[]} canCreate={false} />);
    expect(screen.getByText(/noch keine termine geplant/i)).toBeInTheDocument();
  });

  it("shows the title, team, venue, and type", () => {
    render(<EventsOverview events={[baseEvent]} canCreate={false} />);
    expect(screen.getByText("Training E1")).toBeInTheDocument();
    expect(screen.getByText(/e1 · sportplatz benediktbeuern/i)).toBeInTheDocument();
    expect(screen.getByText("Training")).toBeInTheDocument();
  });

  it("falls back to the department name when there is no team", () => {
    render(<EventsOverview events={[{ ...baseEvent, teamName: null, departmentName: "Fußball" }]} canCreate={false} />);
    expect(screen.getByText(/fußball/i)).toBeInTheDocument();
  });

  it("hides the create link without permission", () => {
    render(<EventsOverview events={[]} canCreate={false} />);
    expect(screen.queryByText(/termin anlegen/i)).not.toBeInTheDocument();
  });

  it("shows the create link with permission", () => {
    render(<EventsOverview events={[]} canCreate={true} />);
    expect(screen.getByText(/termin anlegen/i)).toBeInTheDocument();
  });

  it("links each event to its detail page", () => {
    render(<EventsOverview events={[baseEvent]} canCreate={false} />);
    expect(screen.getByRole("link", { name: /training e1/i })).toHaveAttribute("href", "/kalender/event-1");
  });
});
