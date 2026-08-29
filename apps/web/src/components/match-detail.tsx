import Link from "next/link";
import { updateMatchAction } from "@/app/actions";
import { MatchDateTimeInput } from "./match-datetime-input";
import {
  MATCH_HOME_AWAY_LABELS,
  MATCH_STATUS_LABELS,
  MATCH_TYPE_LABELS,
  type MatchOverviewHomeAway,
  type MatchOverviewStatus,
  type MatchOverviewType,
} from "./matches-overview";

export interface MatchDetailMatch {
  id: string;
  teamName: string;
  venueId: string | null;
  venueName: string | null;
  startsAt: string;
  type: MatchOverviewType;
  status: MatchOverviewStatus;
  homeAway: MatchOverviewHomeAway;
  opponentName: string;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
  canEdit: boolean;
}

export interface MatchDetailVenue {
  id: string;
  name: string;
}

export interface MatchDetailProps {
  match: MatchDetailMatch;
  venues: MatchDetailVenue[];
}

/** Pure presentational component — see apps/web/src/app/fussball/spiele/[id]/page.tsx. */
export function MatchDetail({ match, venues }: MatchDetailProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <Link href="/fussball" className="hover:text-[var(--color-primary)]">
          Fußball
        </Link>
        <span className="mx-1">/</span>
        <Link href="/fussball/spiele" className="hover:text-[var(--color-primary)]">
          Spiele
        </Link>
        <span className="mx-1">/</span>
        <span>
          {match.teamName} – {match.opponentName}
        </span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">
          {match.teamName} – {match.opponentName}
        </h1>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
          {MATCH_STATUS_LABELS[match.status]}
        </span>
      </div>
      {match.status === "COMPLETED" && match.homeScore != null && match.awayScore != null && (
        <p className="text-sm text-neutral-600">
          Ergebnis: {match.homeScore}:{match.awayScore}
        </p>
      )}

      {!match.canEdit ? (
        <div className="space-y-1 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
          <p>{MATCH_HOME_AWAY_LABELS[match.homeAway]}</p>
          <p>{match.venueName ?? "Keine Spielstätte angegeben"}</p>
          <p>{MATCH_TYPE_LABELS[match.type]}</p>
          {match.notes && <p>Notiz: {match.notes}</p>}
        </div>
      ) : (
        <form
          action={updateMatchAction.bind(null, match.id)}
          className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="opponentName" className="text-sm text-neutral-600">
              Gegner
            </label>
            <input
              id="opponentName"
              name="opponentName"
              defaultValue={match.opponentName}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <MatchDateTimeInput defaultValueIso={match.startsAt} />

          <div className="flex flex-col gap-1">
            <label htmlFor="homeAway" className="text-sm text-neutral-600">
              Heim/Auswärts
            </label>
            <select
              id="homeAway"
              name="homeAway"
              defaultValue={match.homeAway}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              {Object.entries(MATCH_HOME_AWAY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="venueId" className="text-sm text-neutral-600">
              Spielstätte
            </label>
            <select
              id="venueId"
              name="venueId"
              defaultValue={match.venueId ?? ""}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              <option value="">Keine Angabe</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="type" className="text-sm text-neutral-600">
              Spieltyp
            </label>
            <select
              id="type"
              name="type"
              defaultValue={match.type}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              {Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-sm text-neutral-600">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={match.status}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              {Object.entries(MATCH_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="homeScore" className="text-sm text-neutral-600">
                Tore Heim
              </label>
              <input
                id="homeScore"
                name="homeScore"
                type="number"
                min={0}
                defaultValue={match.homeScore ?? ""}
                aria-label="Tore Heim"
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="awayScore" className="text-sm text-neutral-600">
                Tore Auswärts
              </label>
              <input
                id="awayScore"
                name="awayScore"
                type="number"
                min={0}
                defaultValue={match.awayScore ?? ""}
                aria-label="Tore Auswärts"
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Ein Ergebnis wird nur gespeichert, wenn der Status „Abgeschlossen“ ist.
          </p>

          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-sm text-neutral-600">
              Notiz
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={match.notes ?? ""}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Speichern
          </button>
        </form>
      )}
    </main>
  );
}
