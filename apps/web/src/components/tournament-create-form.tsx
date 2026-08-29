import Link from "next/link";
import { createTournamentAction } from "@/app/actions";
import { DateTimeInput } from "./datetime-input";
import { TOURNAMENT_MODE_LABELS } from "./tournaments-overview";

export interface TournamentCreateFormSeason {
  id: string;
  name: string;
}

export interface TournamentCreateFormProps {
  departmentId: string;
  seasons: TournamentCreateFormSeason[];
}

/** Pure presentational component — see apps/web/src/app/fussball/turniere/neu/page.tsx. */
export function TournamentCreateForm({ departmentId, seasons }: TournamentCreateFormProps) {
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
        <Link href="/fussball/turniere" className="hover:text-[var(--color-primary)]">
          Turniere
        </Link>
        <span className="mx-1">/</span>
        <span>Neu</span>
      </nav>

      <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Turnier anlegen</h1>

      <form
        action={createTournamentAction.bind(null, departmentId)}
        className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm text-neutral-600">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm text-neutral-600">
            Beschreibung
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <DateTimeInput name="startsAt" label="Beginn" required />
        <DateTimeInput name="endsAt" label="Ende (optional)" />

        {seasons.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="seasonId" className="text-sm text-neutral-600">
              Saison
            </label>
            <select
              id="seasonId"
              name="seasonId"
              defaultValue=""
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              <option value="">Keine Angabe</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="mode" className="text-sm text-neutral-600">
            Modus
          </label>
          <select
            id="mode"
            name="mode"
            defaultValue=""
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          >
            <option value="">Noch nicht festgelegt</option>
            {Object.entries(TOURNAMENT_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Turnier anlegen
        </button>
      </form>
    </main>
  );
}
