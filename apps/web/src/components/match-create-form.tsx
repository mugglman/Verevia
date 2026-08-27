import Link from "next/link";
import { createMatchAction } from "@/app/actions";
import { MatchDateTimeInput } from "./match-datetime-input";
import { MATCH_HOME_AWAY_LABELS, MATCH_TYPE_LABELS } from "./matches-overview";

export interface MatchCreateFormTeamSeason {
  id: string;
  teamName: string;
  ageGroupName: string;
}

export interface MatchCreateFormVenue {
  id: string;
  name: string;
}

export interface MatchCreateFormProps {
  teamSeasons: MatchCreateFormTeamSeason[];
  venues: MatchCreateFormVenue[];
}

/** Pure presentational component — see apps/web/src/app/fussball/spiele/neu/page.tsx. */
export function MatchCreateForm({ teamSeasons, venues }: MatchCreateFormProps) {
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
        <span>Neu</span>
      </nav>

      <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Spiel anlegen</h1>

      {teamSeasons.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          Keine Mannschaft verfügbar, für die du ein Spiel anlegen darfst.
        </p>
      ) : (
        <form action={createMatchAction} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="teamSeasonId" className="text-sm text-neutral-600">
              Mannschaft
            </label>
            <select
              id="teamSeasonId"
              name="teamSeasonId"
              required
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              {teamSeasons.map((ts) => (
                <option key={ts.id} value={ts.id}>
                  {ts.teamName} ({ts.ageGroupName})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="opponentName" className="text-sm text-neutral-600">
              Gegner
            </label>
            <input
              id="opponentName"
              name="opponentName"
              required
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm text-neutral-600">Datum und Uhrzeit</span>
            <MatchDateTimeInput />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="homeAway" className="text-sm text-neutral-600">
              Heim/Auswärts
            </label>
            <select
              id="homeAway"
              name="homeAway"
              required
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
              defaultValue=""
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
              required
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
            <label htmlFor="notes" className="text-sm text-neutral-600">
              Notiz
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Spiel anlegen
          </button>
        </form>
      )}
    </main>
  );
}
