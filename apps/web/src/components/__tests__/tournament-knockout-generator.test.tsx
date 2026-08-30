import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const previewMock = vi.fn();
const commitMock = vi.fn();

vi.mock("@/app/actions", () => ({
  previewTournamentKnockoutAction: (...args: unknown[]) => previewMock(...args),
  commitTournamentKnockoutAction: (...args: unknown[]) => commitMock(...args),
}));

import { TournamentKnockoutGenerator } from "../tournament-knockout-generator";

const baseProps = {
  tournamentId: "tournament-1",
  tournamentName: "Verevia Pokal 2026",
  hasExistingSchedule: false,
  participants: [
    { id: "participant-1", label: "E1" },
    { id: "participant-2", label: "SV Pokaljäger" },
    { id: "participant-3", label: "FC Endspielstadt" },
    { id: "participant-4", label: "TSV Siegerfeld" },
  ],
  groups: [{ id: "group-1", name: "Gruppe A" }],
  availableVenues: [{ venueId: "venue-1", venueName: "Sportplatz Benediktbeuern", label: "Hauptplatz" }],
};

const validPreview = {
  valid: true,
  matches: [
    {
      key: "SF-1",
      round: "SEMIFINAL",
      homeLabel: "E1",
      awayLabel: "TSV Siegerfeld",
      venueName: "Hauptplatz (Sportplatz Benediktbeuern)",
      startsAt: "2026-12-05T09:00:00.000Z",
      endsAt: "2026-12-05T09:10:00.000Z",
    },
    {
      key: "SF-2",
      round: "SEMIFINAL",
      homeLabel: "SV Pokaljäger",
      awayLabel: "FC Endspielstadt",
      venueName: "Hauptplatz (Sportplatz Benediktbeuern)",
      startsAt: "2026-12-05T09:12:00.000Z",
      endsAt: "2026-12-05T09:22:00.000Z",
    },
    {
      key: "FINAL",
      round: "FINAL",
      homeLabel: "Sieger Halbfinale 1",
      awayLabel: "Sieger Halbfinale 2",
      venueName: "Hauptplatz (Sportplatz Benediktbeuern)",
      startsAt: "2026-12-05T09:34:00.000Z",
      endsAt: "2026-12-05T09:44:00.000Z",
    },
  ],
  conflicts: [],
  statistics: { totalMatches: 3, firstMatchAt: "2026-12-05T09:00:00.000Z", lastMatchEndsAt: "2026-12-05T09:44:00.000Z" },
  fingerprint: "abc123",
};

function addFirstFourEntrants() {
  fireEvent.click(screen.getByRole("button", { name: "+ E1" }));
  fireEvent.click(screen.getByRole("button", { name: "+ SV Pokaljäger" }));
  fireEvent.click(screen.getByRole("button", { name: "+ FC Endspielstadt" }));
  fireEvent.click(screen.getByRole("button", { name: "+ TSV Siegerfeld" }));
}

describe("TournamentKnockoutGenerator", () => {
  it("shows a blocking message when a schedule already exists, without rendering the entrant builder", () => {
    render(<TournamentKnockoutGenerator {...baseProps} hasExistingSchedule={true} />);
    expect(screen.getByText(/existiert bereits ein spielplan/i)).toBeInTheDocument();
    expect(screen.queryByText(/setzliste/i)).not.toBeInTheDocument();
  });

  it("disables the calculate button until at least 2 entrants are set", () => {
    render(<TournamentKnockoutGenerator {...baseProps} />);
    expect(screen.getByRole("button", { name: /ko-baum berechnen/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "+ E1" }));
    expect(screen.getByRole("button", { name: /ko-baum berechnen/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "+ SV Pokaljäger" }));
    expect(screen.getByRole("button", { name: /ko-baum berechnen/i })).not.toBeDisabled();
  });

  it("removes an added team from the seed list and makes it selectable again", () => {
    render(<TournamentKnockoutGenerator {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "+ E1" }));
    expect(screen.getByText(/Setzung 1:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ E1" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Setzung 1 entfernen" }));
    expect(screen.queryByText(/Setzung 1:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ E1" })).toBeInTheDocument();
  });

  it("reorders entrants with the up/down controls", () => {
    render(<TournamentKnockoutGenerator {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "+ E1" }));
    fireEvent.click(screen.getByRole("button", { name: "+ SV Pokaljäger" }));

    function seedListText() {
      return screen.getAllByRole("listitem").map((li) => li.textContent!.replace(/\s+/g, " ").trim());
    }
    expect(seedListText()[0]).toMatch(/^Setzung 1: E1/);
    expect(seedListText()[1]).toMatch(/^Setzung 2: SV Pokaljäger/);

    fireEvent.click(screen.getByRole("button", { name: "Setzung 2 nach oben verschieben" }));
    expect(seedListText()[0]).toMatch(/^Setzung 1: SV Pokaljäger/);
    expect(seedListText()[1]).toMatch(/^Setzung 2: E1/);
  });

  it("calling 'KO-Baum berechnen' shows the returned valid preview grouped by round with a commit button", async () => {
    previewMock.mockResolvedValueOnce({ ok: true, data: validPreview });
    render(<TournamentKnockoutGenerator {...baseProps} />);
    addFirstFourEntrants();

    fireEvent.click(screen.getByRole("button", { name: /ko-baum berechnen/i }));

    expect(await screen.findByText(/erfüllt alle eingestellten pausen/i)).toBeInTheDocument();
    expect(screen.getByText("Halbfinale")).toBeInTheDocument();
    expect(screen.getByText("Finale")).toBeInTheDocument();
    expect(screen.getByText(/Sieger Halbfinale 1 – Sieger Halbfinale 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ko-baum übernehmen \(3 spiele\)/i })).toBeInTheDocument();
    expect(previewMock).toHaveBeenCalledWith(
      "tournament-1",
      expect.objectContaining({
        entrants: [
          { type: "TEAM", participantId: "participant-1" },
          { type: "TEAM", participantId: "participant-2" },
          { type: "TEAM", participantId: "participant-3" },
          { type: "TEAM", participantId: "participant-4" },
        ],
        includeThirdPlace: false,
        venueIds: ["venue-1"],
      }),
    );
  });

  it("shows conflicts and no commit button when the preview is invalid", async () => {
    previewMock.mockResolvedValueOnce({
      ok: true,
      data: { ...validPreview, valid: false, matches: [], conflicts: ["Das Finale kann nicht eingeplant werden, weil nicht genügend Erholungszeit vorhanden ist."] },
    });
    render(<TournamentKnockoutGenerator {...baseProps} />);
    addFirstFourEntrants();

    fireEvent.click(screen.getByRole("button", { name: /ko-baum berechnen/i }));

    expect(await screen.findByText(/nicht genügend erholungszeit/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ko-baum übernehmen/i })).not.toBeInTheDocument();
  });

  it("shows an error message when the preview request itself fails", async () => {
    previewMock.mockResolvedValueOnce({ ok: false, status: 400, message: "Eine ausgewählte Spielstätte ist diesem Turnier nicht zugeordnet." });
    render(<TournamentKnockoutGenerator {...baseProps} />);
    addFirstFourEntrants();

    fireEvent.click(screen.getByRole("button", { name: /ko-baum berechnen/i }));

    expect(await screen.findByText("Eine ausgewählte Spielstätte ist diesem Turnier nicht zugeordnet.")).toBeInTheDocument();
  });

  it("clicking 'KO-Baum übernehmen' calls the commit action with entrants, settings and fingerprint", async () => {
    previewMock.mockResolvedValueOnce({ ok: true, data: validPreview });
    commitMock.mockResolvedValueOnce(undefined); // a successful commit redirects server-side and returns nothing
    render(<TournamentKnockoutGenerator {...baseProps} />);
    addFirstFourEntrants();

    fireEvent.click(screen.getByRole("button", { name: /ko-baum berechnen/i }));
    fireEvent.click(await screen.findByRole("button", { name: /ko-baum übernehmen/i }));

    await vi.waitFor(() =>
      expect(commitMock).toHaveBeenCalledWith(
        "tournament-1",
        expect.objectContaining({ venueIds: ["venue-1"] }),
        "abc123",
      ),
    );
  });

  it("can add a group-placement entrant alongside direct team entrants", () => {
    render(<TournamentKnockoutGenerator {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "+ E1" }));
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    const secondEntry = screen.getAllByRole("listitem")[1]!.textContent!.replace(/\s+/g, " ").trim();
    expect(secondEntry).toMatch(/^Setzung 2: Gruppe A, Platz 1/);
  });

  it("does not expose technical IDs in visible text", () => {
    render(<TournamentKnockoutGenerator {...baseProps} />);
    expect(screen.queryByText(/tournament-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/participant-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/venue-1/)).not.toBeInTheDocument();
  });
});
