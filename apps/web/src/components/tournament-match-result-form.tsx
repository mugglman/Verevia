"use client";

import { useState } from "react";
import { updateTournamentMatchResultAction } from "@/app/actions";

export interface TournamentMatchResultFormProps {
  tournamentId: string;
  matchId: string;
  hasExistingResult: boolean;
  initialHomeScore: number | null;
  initialAwayScore: number | null;
}

/**
 * Inline result-entry affordance for a single, already-playable tournament
 * match — see apps/web/src/components/tournament-detail.tsx, which renders
 * this only when both participants are resolved and the result isn't yet
 * locked (MatchDto.resultLocked, ADR 0011). Purely a controlled entry point
 * into the existing PATCH /football/matches/:id + Phase 14 slot-resolution
 * pipeline — no result logic lives here.
 */
export function TournamentMatchResultForm({
  tournamentId,
  matchId,
  hasExistingResult,
  initialHomeScore,
  initialAwayScore,
}: TournamentMatchResultFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [homeScore, setHomeScore] = useState(initialHomeScore ?? 0);
  const [awayScore, setAwayScore] = useState(initialAwayScore ?? 0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
      >
        {hasExistingResult ? "Ergebnis bearbeiten" : "Ergebnis eintragen"}
      </button>
    );
  }

  async function handleSave() {
    setErrorMessage(null);
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      setErrorMessage("Bitte gib für beide Mannschaften ein gültiges Ergebnis (0 oder mehr Tore) ein.");
      return;
    }
    setIsSaving(true);
    const result = await updateTournamentMatchResultAction(tournamentId, matchId, { homeScore, awayScore });
    setIsSaving(false);
    if (!result.ok) {
      setErrorMessage(result.message ?? "Das Ergebnis konnte nicht gespeichert werden.");
      return;
    }
    setIsOpen(false);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      // Native browser validation UI is inconsistent and untranslated —
      // our own JS check below always produces the same styled German
      // error message instead (see handleSave).
      noValidate
      className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`homeScore-${matchId}`} className="text-xs text-neutral-500">
          Tore Heim
        </label>
        <input
          id={`homeScore-${matchId}`}
          type="number"
          min={0}
          required
          value={homeScore}
          onChange={(e) => setHomeScore(Number(e.target.value))}
          disabled={isSaving}
          className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`awayScore-${matchId}`} className="text-xs text-neutral-500">
          Tore Auswärts
        </label>
        <input
          id={`awayScore-${matchId}`}
          type="number"
          min={0}
          required
          value={awayScore}
          onChange={(e) => setAwayScore(Number(e.target.value))}
          disabled={isSaving}
          className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50"
        />
      </div>
      <button
        type="submit"
        disabled={isSaving}
        className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {isSaving ? "Wird gespeichert …" : "Speichern"}
      </button>
      <button
        type="button"
        onClick={() => {
          setIsOpen(false);
          setErrorMessage(null);
        }}
        disabled={isSaving}
        className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
      >
        Abbrechen
      </button>
      {errorMessage && <p className="w-full text-sm text-red-600">{errorMessage}</p>}
    </form>
  );
}
