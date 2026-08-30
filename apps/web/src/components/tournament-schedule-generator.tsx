"use client";

import Link from "next/link";
import { useState } from "react";
import { commitTournamentScheduleAction, previewTournamentScheduleAction } from "@/app/actions";

export interface ScheduleGeneratorGroup {
  id: string;
  name: string;
  participantCount: number;
}

export interface ScheduleGeneratorVenue {
  venueId: string;
  venueName: string;
  label: string | null;
}

export interface ScheduleGeneratorProps {
  tournamentId: string;
  tournamentName: string;
  hasExistingSchedule: boolean;
  groups: ScheduleGeneratorGroup[];
  availableVenues: ScheduleGeneratorVenue[];
}

interface PreviewMatch {
  groupId: string | null;
  groupName: string | null;
  homeParticipantName: string;
  awayParticipantName: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
}

interface PreviewStatistics {
  totalMatches: number;
  firstMatchAt: string | null;
  lastMatchEndsAt: string | null;
}

interface SchedulePreview {
  valid: boolean;
  matches: PreviewMatch[];
  conflicts: string[];
  statistics: PreviewStatistics;
  fingerprint: string;
}

function venueDisplayName(venue: ScheduleGeneratorVenue): string {
  return venue.label ? `${venue.label} (${venue.venueName})` : venue.venueName;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} · ${time}`;
}

/** Pure presentational component — see apps/web/src/app/fussball/turniere/[id]/spielplan/page.tsx. */
export function TournamentScheduleGenerator({
  tournamentId,
  tournamentName,
  hasExistingSchedule,
  groups,
  availableVenues,
}: ScheduleGeneratorProps) {
  const [matchDurationMinutes, setMatchDurationMinutes] = useState(10);
  const [changeoverMinutes, setChangeoverMinutes] = useState(2);
  const [minimumRestMinutes, setMinimumRestMinutes] = useState(10);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>(availableVenues.map((v) => v.venueId));
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const breadcrumb = (
    <nav className="text-sm text-neutral-500">
      <Link href="/" className="hover:text-[var(--color-primary)]">
        Verein
      </Link>
      <span className="mx-1">/</span>
      <Link href="/fussball" className="hover:text-[var(--color-primary)]">
        Fußball
      </Link>
      <span className="mx-1">/</span>
      <Link href="/fussball/turniere" className="hover:text-[var(--color-primary)]">
        Turniere
      </Link>
      <span className="mx-1">/</span>
      <Link href={`/fussball/turniere/${tournamentId}`} className="hover:text-[var(--color-primary)]">
        {tournamentName}
      </Link>
      <span className="mx-1">/</span>
      <span>Spielplan erstellen</span>
    </nav>
  );

  if (hasExistingSchedule) {
    return (
      <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
        {breadcrumb}
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Spielplan erstellen</h1>
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          Für dieses Turnier existiert bereits ein Spielplan.
        </p>
        <Link href={`/fussball/turniere/${tournamentId}`} className="text-sm font-medium text-[var(--color-primary)] hover:underline">
          Zurück zum Turnier
        </Link>
      </main>
    );
  }

  const theoreticalMatchCount = groups.reduce((sum, g) => sum + (g.participantCount * (g.participantCount - 1)) / 2, 0);
  const totalParticipants = groups.reduce((sum, g) => sum + g.participantCount, 0);

  function toggleVenue(venueId: string) {
    setSelectedVenueIds((current) => (current.includes(venueId) ? current.filter((id) => id !== venueId) : [...current, venueId]));
  }

  async function handleCalculate() {
    setErrorMessage(null);
    setIsCalculating(true);
    const result = await previewTournamentScheduleAction(tournamentId, {
      matchDurationMinutes,
      changeoverMinutes,
      minimumRestMinutes,
      venueIds: selectedVenueIds,
    });
    setIsCalculating(false);
    if (!result.ok) {
      setErrorMessage(result.message ?? "Der Spielplan konnte nicht berechnet werden.");
      return;
    }
    setPreview(result.data as SchedulePreview);
  }

  async function handleCommit() {
    if (!preview) return;
    setErrorMessage(null);
    setIsCommitting(true);
    const result = await commitTournamentScheduleAction(
      tournamentId,
      { matchDurationMinutes, changeoverMinutes, minimumRestMinutes, venueIds: selectedVenueIds },
      preview.fingerprint,
    );
    // A successful commit redirects server-side and never returns here.
    setIsCommitting(false);
    if (result && !result.ok) {
      setErrorMessage(result.message ?? "Der Spielplan konnte nicht übernommen werden.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      {breadcrumb}
      <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Spielplan erstellen – {tournamentName}</h1>

      <section className="space-y-1 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        <p>
          {groups.length} Gruppe{groups.length === 1 ? "" : "n"}, {totalParticipants} Teilnehmer insgesamt
        </p>
        <ul className="list-disc pl-5">
          {groups.map((g) => (
            <li key={g.id}>
              {g.name}: {g.participantCount} Teams → {(g.participantCount * (g.participantCount - 1)) / 2} Spiele
            </li>
          ))}
        </ul>
        <p className="font-medium text-[var(--color-dark)]">Voraussichtlich {theoreticalMatchCount} Spiele insgesamt.</p>
      </section>

      {!preview && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCalculate();
          }}
          className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="matchDurationMinutes" className="text-sm text-neutral-600">
              Spieldauer (Minuten)
            </label>
            <input
              id="matchDurationMinutes"
              type="number"
              min={1}
              required
              value={matchDurationMinutes}
              onChange={(e) => setMatchDurationMinutes(Number(e.target.value))}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="changeoverMinutes" className="text-sm text-neutral-600">
              Wechselpause (Minuten)
            </label>
            <input
              id="changeoverMinutes"
              type="number"
              min={0}
              required
              value={changeoverMinutes}
              onChange={(e) => setChangeoverMinutes(Number(e.target.value))}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="minimumRestMinutes" className="text-sm text-neutral-600">
              Mindestpause pro Mannschaft (Minuten)
            </label>
            <input
              id="minimumRestMinutes"
              type="number"
              min={0}
              required
              value={minimumRestMinutes}
              onChange={(e) => setMinimumRestMinutes(Number(e.target.value))}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm text-neutral-600">Spielfelder</legend>
            {availableVenues.length === 0 ? (
              <p className="text-sm text-neutral-500">Diesem Turnier ist noch keine Spielstätte zugeordnet.</p>
            ) : (
              availableVenues.map((venue) => (
                <label key={venue.venueId} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={selectedVenueIds.includes(venue.venueId)}
                    onChange={() => toggleVenue(venue.venueId)}
                  />
                  {venueDisplayName(venue)}
                </label>
              ))
            )}
          </fieldset>

          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

          <button
            type="submit"
            disabled={isCalculating || selectedVenueIds.length === 0}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isCalculating ? "Wird berechnet …" : "Spielplan berechnen"}
          </button>
        </form>
      )}

      {preview && (
        <section className="space-y-4">
          <div className="space-y-1 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
            <p className="font-medium text-[var(--color-dark)]">{preview.statistics.totalMatches} Spiele</p>
            {preview.statistics.firstMatchAt && <p>Erstes Spiel: {formatDateTime(preview.statistics.firstMatchAt)}</p>}
            {preview.statistics.lastMatchEndsAt && (
              <p>Voraussichtliches Turnierende: {formatDateTime(preview.statistics.lastMatchEndsAt)}</p>
            )}
            {preview.valid ? (
              <p className="text-green-700">Der Spielplan erfüllt alle eingestellten Pausen- und Feldregeln.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-red-600">
                {preview.conflicts.map((conflict, index) => (
                  <li key={index}>{conflict}</li>
                ))}
              </ul>
            )}
          </div>

          {preview.valid && (
            <ul className="space-y-2">
              {preview.matches.map((match, index) => (
                <li key={index} className="rounded-2xl border border-neutral-200 bg-white p-3">
                  <p className="text-sm text-neutral-500">
                    {formatDateTime(match.startsAt)} · {match.venueName}
                  </p>
                  <p className="font-medium text-[var(--color-dark)]">
                    {match.homeParticipantName} – {match.awayParticipantName}
                  </p>
                  {match.groupName && <p className="text-sm text-neutral-500">{match.groupName}</p>}
                </li>
              ))}
            </ul>
          )}

          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
            >
              Einstellungen ändern
            </button>
            {preview.valid && (
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={isCommitting}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {isCommitting
                  ? "Wird übernommen …"
                  : `Spielplan übernehmen (${preview.statistics.totalMatches} Spiele)`}
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
