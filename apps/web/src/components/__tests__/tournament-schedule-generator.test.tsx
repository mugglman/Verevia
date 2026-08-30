import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const previewMock = vi.fn();
const commitMock = vi.fn();

vi.mock("@/app/actions", () => ({
  previewTournamentScheduleAction: (...args: unknown[]) => previewMock(...args),
  commitTournamentScheduleAction: (...args: unknown[]) => commitMock(...args),
}));

import { TournamentScheduleGenerator } from "../tournament-schedule-generator";

const baseProps = {
  tournamentId: "tournament-1",
  tournamentName: "Verevia Frühjahrscup 2026",
  hasExistingSchedule: false,
  groups: [{ id: "group-1", name: "Gruppe A", participantCount: 4 }],
  availableVenues: [{ venueId: "venue-1", venueName: "Sportplatz Benediktbeuern", label: "Hauptplatz" }],
};

const validPreview = {
  valid: true,
  matches: [
    {
      groupId: "group-1",
      groupName: "Gruppe A",
      homeParticipantName: "E1",
      awayParticipantName: "SV Testhausen",
      venueName: "Hauptplatz (Sportplatz Benediktbeuern)",
      startsAt: "2026-12-05T09:00:00.000Z",
      endsAt: "2026-12-05T09:10:00.000Z",
    },
  ],
  conflicts: [],
  statistics: { totalMatches: 6, firstMatchAt: "2026-12-05T09:00:00.000Z", lastMatchEndsAt: "2026-12-05T10:30:00.000Z" },
  fingerprint: "abc123",
};

describe("TournamentScheduleGenerator", () => {
  it("shows a blocking message when a schedule already exists, without rendering the form", () => {
    render(<TournamentScheduleGenerator {...baseProps} hasExistingSchedule={true} />);
    expect(screen.getByText(/existiert bereits ein spielplan/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/spieldauer/i)).not.toBeInTheDocument();
  });

  it("shows the theoretical match count computed from group sizes", () => {
    render(<TournamentScheduleGenerator {...baseProps} groups={[{ id: "g1", name: "Gruppe A", participantCount: 4 }]} />);
    // 4 participants → 6 matches (n*(n-1)/2), shown before any API call.
    expect(screen.getByText(/voraussichtlich 6 spiele insgesamt/i)).toBeInTheDocument();
  });

  it("renders the settings form with default values and the venue checkbox", () => {
    render(<TournamentScheduleGenerator {...baseProps} />);
    expect(screen.getByLabelText(/spieldauer/i)).toHaveValue(10);
    expect(screen.getByLabelText(/wechselpause/i)).toHaveValue(2);
    expect(screen.getByLabelText(/mindestpause/i)).toHaveValue(10);
    expect(screen.getByText("Hauptplatz (Sportplatz Benediktbeuern)")).toBeInTheDocument();
  });

  it("disables the submit button when no venue is selected", () => {
    render(<TournamentScheduleGenerator {...baseProps} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox); // deselect the only (pre-selected) venue
    expect(screen.getByRole("button", { name: /spielplan berechnen/i })).toBeDisabled();
  });

  it("calling 'Spielplan berechnen' shows the returned valid preview with matches and a commit button", async () => {
    previewMock.mockResolvedValueOnce({ ok: true, data: validPreview });
    render(<TournamentScheduleGenerator {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /spielplan berechnen/i }));

    expect(await screen.findByText(/erfüllt alle eingestellten pausen/i)).toBeInTheDocument();
    expect(screen.getByText(/E1 – SV Testhausen/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /spielplan übernehmen \(6 spiele\)/i })).toBeInTheDocument();
    expect(previewMock).toHaveBeenCalledWith(
      "tournament-1",
      expect.objectContaining({ matchDurationMinutes: 10, changeoverMinutes: 2, minimumRestMinutes: 10, venueIds: ["venue-1"] }),
    );
  });

  it("shows conflicts and no commit button when the preview is invalid", async () => {
    previewMock.mockResolvedValueOnce({
      ok: true,
      data: { ...validPreview, valid: false, matches: [], conflicts: ["Für Gruppe A konnte kein gültiger Termin gefunden werden."] },
    });
    render(<TournamentScheduleGenerator {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /spielplan berechnen/i }));

    expect(await screen.findByText(/konnte kein gültiger termin gefunden werden/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /spielplan übernehmen/i })).not.toBeInTheDocument();
  });

  it("shows an error message when the preview request itself fails", async () => {
    previewMock.mockResolvedValueOnce({ ok: false, status: 400, message: "Es gibt Teilnehmer ohne Gruppe." });
    render(<TournamentScheduleGenerator {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /spielplan berechnen/i }));

    expect(await screen.findByText("Es gibt Teilnehmer ohne Gruppe.")).toBeInTheDocument();
  });

  it("clicking 'Spielplan übernehmen' calls the commit action with the settings and fingerprint", async () => {
    previewMock.mockResolvedValueOnce({ ok: true, data: validPreview });
    commitMock.mockResolvedValueOnce(undefined); // a successful commit redirects server-side and returns nothing
    render(<TournamentScheduleGenerator {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /spielplan berechnen/i }));
    fireEvent.click(await screen.findByRole("button", { name: /spielplan übernehmen/i }));

    await vi.waitFor(() =>
      expect(commitMock).toHaveBeenCalledWith(
        "tournament-1",
        expect.objectContaining({ venueIds: ["venue-1"] }),
        "abc123",
      ),
    );
  });

  it("does not expose technical IDs in visible text", () => {
    render(<TournamentScheduleGenerator {...baseProps} />);
    expect(screen.queryByText(/tournament-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/venue-1/)).not.toBeInTheDocument();
  });
});
