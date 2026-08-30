"use client";

import Link from "next/link";
import { useState } from "react";
import {
  commitTournamentKnockoutAction,
  previewTournamentKnockoutAction,
  type KnockoutEntrantInput,
} from "@/app/actions";

export interface KnockoutGeneratorParticipant {
  id: string;
  label: string;
}

export interface KnockoutGeneratorGroup {
  id: string;
  name: string;
}

export interface KnockoutGeneratorVenue {
  venueId: string;
  venueName: string;
  label: string | null;
}

export interface KnockoutGeneratorProps {
  tournamentId: string;
  tournamentName: string;
  hasExistingSchedule: boolean;
  participants: KnockoutGeneratorParticipant[];
  groups: KnockoutGeneratorGroup[];
  availableVenues: KnockoutGeneratorVenue[];
}

type Entrant = (KnockoutEntrantInput & { key: string }) & { label: string };

interface PreviewMatch {
  key: string;
  round: "ROUND_OF_16" | "QUARTERFINAL" | "SEMIFINAL" | "THIRD_PLACE" | "FINAL";
  homeLabel: string;
  awayLabel: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
}

interface PreviewStatistics {
  totalMatches: number;
  firstMatchAt: string | null;
  lastMatchEndsAt: string | null;
}

interface KnockoutPreview {
  valid: boolean;
  matches: PreviewMatch[];
  conflicts: string[];
  statistics: PreviewStatistics;
  fingerprint: string;
}

const ROUND_ORDER: PreviewMatch["round"][] = ["ROUND_OF_16", "QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"];
const ROUND_LABELS: Record<PreviewMatch["round"], string> = {
  ROUND_OF_16: "Achtelfinale",
  QUARTERFINAL: "Viertelfinale",
  SEMIFINAL: "Halbfinale",
  THIRD_PLACE: "Spiel um Platz 3",
  FINAL: "Finale",
};

function venueDisplayName(venue: KnockoutGeneratorVenue): string {
  return venue.label ? `${venue.label} (${venue.venueName})` : venue.venueName;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} · ${time}`;
}

function groupMatchesByRound(matches: PreviewMatch[]): Array<{ round: PreviewMatch["round"]; matches: PreviewMatch[] }> {
  return ROUND_ORDER.map((round) => ({ round, matches: matches.filter((m) => m.round === round) })).filter(
    (group) => group.matches.length > 0,
  );
}

/** Pure presentational component — see apps/web/src/app/fussball/turniere/[id]/ko-baum/page.tsx. */
export function TournamentKnockoutGenerator({
  tournamentId,
  tournamentName,
  hasExistingSchedule,
  participants,
  groups,
  availableVenues,
}: KnockoutGeneratorProps) {
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [groupPositionGroupId, setGroupPositionGroupId] = useState(groups[0]?.id ?? "");
  const [groupPositionValue, setGroupPositionValue] = useState(1);
  const [includeThirdPlace, setIncludeThirdPlace] = useState(false);
  const [matchDurationMinutes, setMatchDurationMinutes] = useState(10);
  const [changeoverMinutes, setChangeoverMinutes] = useState(2);
  const [minimumRestMinutes, setMinimumRestMinutes] = useState(10);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>(availableVenues.map((v) => v.venueId));
  const [preview, setPreview] = useState<KnockoutPreview | null>(null);
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
      <span>KO-Baum erstellen</span>
    </nav>
  );

  if (hasExistingSchedule) {
    return (
      <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
        {breadcrumb}
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">KO-Baum erstellen</h1>
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          Für dieses Turnier existiert bereits ein Spielplan.
        </p>
        <Link href={`/fussball/turniere/${tournamentId}`} className="text-sm font-medium text-[var(--color-primary)] hover:underline">
          Zurück zum Turnier
        </Link>
      </main>
    );
  }

  const usedParticipantIds = new Set(entrants.filter((e) => e.type === "TEAM").map((e) => (e as Extract<Entrant, { type: "TEAM" }>).participantId));
  const availableParticipants = participants.filter((p) => !usedParticipantIds.has(p.id));

  function addTeamEntrant(participant: KnockoutGeneratorParticipant) {
    setEntrants((current) => [...current, { key: `TEAM:${participant.id}`, type: "TEAM", participantId: participant.id, label: participant.label }]);
  }

  function addGroupPositionEntrant() {
    if (!groupPositionGroupId || groupPositionValue < 1) return;
    const group = groups.find((g) => g.id === groupPositionGroupId);
    const label = `${group?.name ?? "Gruppe"}, Platz ${groupPositionValue}`;
    setEntrants((current) => [
      ...current,
      { key: `GROUP:${groupPositionGroupId}:${groupPositionValue}:${current.length}`, type: "GROUP_POSITION", groupId: groupPositionGroupId, position: groupPositionValue, label },
    ]);
  }

  function removeEntrant(key: string) {
    setEntrants((current) => current.filter((e) => e.key !== key));
  }

  function moveEntrant(index: number, direction: -1 | 1) {
    setEntrants((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      const moved = next[index]!;
      next[index] = next[target]!;
      next[target] = moved;
      return next;
    });
  }

  function toggleVenue(venueId: string) {
    setSelectedVenueIds((current) => (current.includes(venueId) ? current.filter((id) => id !== venueId) : [...current, venueId]));
  }

  function toEntrantInputs(): KnockoutEntrantInput[] {
    return entrants.map((e) =>
      e.type === "TEAM" ? { type: "TEAM", participantId: e.participantId } : { type: "GROUP_POSITION", groupId: e.groupId, position: e.position },
    );
  }

  async function handleCalculate() {
    setErrorMessage(null);
    setIsCalculating(true);
    const result = await previewTournamentKnockoutAction(tournamentId, {
      entrants: toEntrantInputs(),
      includeThirdPlace,
      matchDurationMinutes,
      changeoverMinutes,
      minimumRestMinutes,
      venueIds: selectedVenueIds,
    });
    setIsCalculating(false);
    if (!result.ok) {
      setErrorMessage(result.message ?? "Der KO-Baum konnte nicht berechnet werden.");
      return;
    }
    setPreview(result.data as KnockoutPreview);
  }

  async function handleCommit() {
    if (!preview) return;
    setErrorMessage(null);
    setIsCommitting(true);
    const result = await commitTournamentKnockoutAction(
      tournamentId,
      {
        entrants: toEntrantInputs(),
        includeThirdPlace,
        matchDurationMinutes,
        changeoverMinutes,
        minimumRestMinutes,
        venueIds: selectedVenueIds,
      },
      preview.fingerprint,
    );
    // A successful commit redirects server-side and never returns here.
    setIsCommitting(false);
    if (result && !result.ok) {
      setErrorMessage(result.message ?? "Der KO-Baum konnte nicht übernommen werden.");
    }
  }

  const canCalculate = entrants.length >= 2 && selectedVenueIds.length > 0;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      {breadcrumb}
      <h1 className="text-2xl font-semibold text-[var(--color-dark)]">KO-Baum erstellen – {tournamentName}</h1>

      {!preview && (
        <>
          <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Setzliste</h2>
            <p className="text-sm text-neutral-600">
              Lege die Reihenfolge der Setzung fest. Position 1 wird gegen die letzte Position gesetzt (Standard-Turnierbaum-Setzung).
            </p>

            {entrants.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500">
                Noch keine Setzungen ausgewählt.
              </p>
            ) : (
              <ol className="space-y-2">
                {entrants.map((entrant, index) => (
                  <li
                    key={entrant.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm"
                  >
                    <span>
                      <span className="font-medium text-[var(--color-dark)]">Setzung {index + 1}:</span> {entrant.label}
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveEntrant(index, -1)}
                        disabled={index === 0}
                        aria-label={`Setzung ${index + 1} nach oben verschieben`}
                        className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-200 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveEntrant(index, 1)}
                        disabled={index === entrants.length - 1}
                        aria-label={`Setzung ${index + 1} nach unten verschieben`}
                        className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-200 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEntrant(entrant.key)}
                        aria-label={`Setzung ${index + 1} entfernen`}
                        className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        Entfernen
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {availableParticipants.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-neutral-600">Team direkt setzen</p>
                <div className="flex flex-wrap gap-2">
                  {availableParticipants.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addTeamEntrant(p)}
                      className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
                    >
                      + {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {groups.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-neutral-600">Gruppenplatzierung setzen (Sieger einer Gruppenphase)</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="groupPositionGroupId" className="text-xs text-neutral-500">
                      Gruppe
                    </label>
                    <select
                      id="groupPositionGroupId"
                      value={groupPositionGroupId}
                      onChange={(e) => setGroupPositionGroupId(e.target.value)}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="groupPositionValue" className="text-xs text-neutral-500">
                      Platz
                    </label>
                    <input
                      id="groupPositionValue"
                      type="number"
                      min={1}
                      value={groupPositionValue}
                      onChange={(e) => setGroupPositionValue(Number(e.target.value))}
                      className="w-20 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addGroupPositionEntrant}
                    className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
                  >
                    Hinzufügen
                  </button>
                </div>
              </div>
            )}
          </section>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCalculate();
            }}
            className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={includeThirdPlace} onChange={(e) => setIncludeThirdPlace(e.target.checked)} />
              Spiel um Platz 3 einplanen
            </label>

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
                    <input type="checkbox" checked={selectedVenueIds.includes(venue.venueId)} onChange={() => toggleVenue(venue.venueId)} />
                    {venueDisplayName(venue)}
                  </label>
                ))
              )}
            </fieldset>

            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

            <button
              type="submit"
              disabled={isCalculating || !canCalculate}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {isCalculating ? "Wird berechnet …" : "KO-Baum berechnen"}
            </button>
            {entrants.length < 2 && <p className="text-sm text-neutral-500">Mindestens 2 Setzungen erforderlich.</p>}
          </form>
        </>
      )}

      {preview && (
        <section className="space-y-4">
          <div className="space-y-1 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
            <p className="font-medium text-[var(--color-dark)]">{preview.statistics.totalMatches} Spiele</p>
            {preview.statistics.firstMatchAt && <p>Erstes Spiel: {formatDateTime(preview.statistics.firstMatchAt)}</p>}
            {preview.statistics.lastMatchEndsAt && <p>Voraussichtliches Turnierende: {formatDateTime(preview.statistics.lastMatchEndsAt)}</p>}
            {preview.valid ? (
              <p className="text-green-700">Der KO-Baum erfüllt alle eingestellten Pausen- und Feldregeln.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-red-600">
                {preview.conflicts.map((conflict, index) => (
                  <li key={index}>{conflict}</li>
                ))}
              </ul>
            )}
          </div>

          {preview.valid &&
            groupMatchesByRound(preview.matches).map((group) => (
              <div key={group.round} className="space-y-2">
                <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">{ROUND_LABELS[group.round]}</h2>
                <ul className="space-y-2">
                  {group.matches.map((match) => (
                    <li key={match.key} className="rounded-2xl border border-neutral-200 bg-white p-3">
                      <p className="text-sm text-neutral-500">
                        {formatDateTime(match.startsAt)} · {match.venueName}
                      </p>
                      <p className="font-medium text-[var(--color-dark)]">
                        {match.homeLabel} – {match.awayLabel}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

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
                {isCommitting ? "Wird übernommen …" : `KO-Baum übernehmen (${preview.statistics.totalMatches} Spiele)`}
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
