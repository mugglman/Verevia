import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const updateResultMock = vi.fn();

vi.mock("@/app/actions", () => ({
  updateTournamentMatchResultAction: (...args: unknown[]) => updateResultMock(...args),
}));

import { TournamentMatchResultForm } from "../tournament-match-result-form";

const baseProps = {
  tournamentId: "tournament-1",
  matchId: "match-1",
  hasExistingResult: false,
  initialHomeScore: null,
  initialAwayScore: null,
};

describe("TournamentMatchResultForm", () => {
  it("shows 'Ergebnis eintragen' when no result exists yet, and reveals the form on click", () => {
    render(<TournamentMatchResultForm {...baseProps} />);
    expect(screen.getByRole("button", { name: "Ergebnis eintragen" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/tore heim/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ergebnis eintragen" }));
    expect(screen.getByLabelText(/tore heim/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tore auswärts/i)).toBeInTheDocument();
  });

  it("shows 'Ergebnis bearbeiten' when a (not yet locked) result already exists, pre-filled", () => {
    render(<TournamentMatchResultForm {...baseProps} hasExistingResult initialHomeScore={2} initialAwayScore={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis bearbeiten" }));
    expect(screen.getByLabelText(/tore heim/i)).toHaveValue(2);
    expect(screen.getByLabelText(/tore auswärts/i)).toHaveValue(1);
  });

  it("'Abbrechen' hides the form again without saving", () => {
    render(<TournamentMatchResultForm {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis eintragen" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText(/tore heim/i)).not.toBeInTheDocument();
    expect(updateResultMock).not.toHaveBeenCalled();
  });

  it("blocks a negative score client-side without calling the action", async () => {
    render(<TournamentMatchResultForm {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis eintragen" }));
    fireEvent.change(screen.getByLabelText(/tore heim/i), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText(/gültiges ergebnis/i)).toBeInTheDocument();
    expect(updateResultMock).not.toHaveBeenCalled();
  });

  it("saves a valid result, calling the action with the entered scores, and closes the form on success", async () => {
    updateResultMock.mockResolvedValueOnce({ ok: true, data: {} });
    render(<TournamentMatchResultForm {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis eintragen" }));
    fireEvent.change(screen.getByLabelText(/tore heim/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/tore auswärts/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(updateResultMock).toHaveBeenCalledWith("tournament-1", "match-1", { homeScore: 3, awayScore: 1 });
    // Reverts to the closed toggle button. Its label still reads
    // "Ergebnis eintragen" here because this is a pure prop-driven
    // component with no local re-fetch — in the real app, the containing
    // Server Action's revalidatePath() causes the parent server component
    // to re-render with hasExistingResult now true (see actions.ts).
    await screen.findByRole("button", { name: "Ergebnis eintragen" });
    expect(screen.queryByLabelText(/tore heim/i)).not.toBeInTheDocument();
  });

  it("shows 'Wird gespeichert …' and disables Save/Cancel while the request is in flight (double-submit prevention)", async () => {
    let resolveAction!: (value: { ok: true; data: unknown }) => void;
    updateResultMock.mockReturnValueOnce(new Promise((resolve) => (resolveAction = resolve)));
    render(<TournamentMatchResultForm {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis eintragen" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("button", { name: /wird gespeichert/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeDisabled();

    resolveAction({ ok: true, data: {} });
    await screen.findByRole("button", { name: "Ergebnis eintragen" });
  });

  it("shows a 409 'already propagated' error inline without a technical status code", async () => {
    updateResultMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      message: "Das Ergebnis wurde bereits zur Auslosung nachfolgender KO-Spiele verwendet und kann nicht mehr geändert werden.",
    });
    render(<TournamentMatchResultForm {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis eintragen" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText(/bereits zur auslosung nachfolgender ko-spiele verwendet/i)).toBeInTheDocument();
    expect(screen.queryByText(/409/)).not.toBeInTheDocument();
    // The form stays open so the failed save is visibly not persisted.
    expect(screen.getByLabelText(/tore heim/i)).toBeInTheDocument();
  });

  it("shows a generic German fallback message for an unspecific API error", async () => {
    updateResultMock.mockResolvedValueOnce({ ok: false, status: 500 });
    render(<TournamentMatchResultForm {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis eintragen" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Das Ergebnis konnte nicht gespeichert werden.")).toBeInTheDocument();
  });

  it("does not expose technical IDs in visible text", () => {
    render(<TournamentMatchResultForm {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Ergebnis eintragen" }));
    expect(screen.queryByText(/tournament-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/match-1/)).not.toBeInTheDocument();
  });
});
