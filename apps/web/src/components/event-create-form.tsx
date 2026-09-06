import Link from "next/link";
import { createEventAction } from "@/app/actions";
import { DateTimeInput } from "./datetime-input";
import { EVENT_TYPE_LABELS } from "./events-overview";

export interface EventCreateFormTeam {
  id: string;
  name: string;
}

export interface EventCreateFormDepartment {
  id: string;
  name: string;
}

export interface EventCreateFormVenue {
  id: string;
  name: string;
}

export interface EventCreateFormProps {
  teams: EventCreateFormTeam[];
  departments: EventCreateFormDepartment[];
  venues: EventCreateFormVenue[];
}

/**
 * Pure presentational component — see apps/web/src/app/kalender/neu/page.tsx.
 * "Für wen" is a single select combining teams and departments (prefixed
 * `team:`/`department:` values) rather than two separate selects — an
 * event belongs to exactly one of them (event_scope_xor), so presenting it
 * as one choice avoids an awkward "leave the other one empty" UX.
 */
export function EventCreateForm({ teams, departments, venues }: EventCreateFormProps) {
  const hasScopeOptions = teams.length > 0 || departments.length > 0;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <Link href="/kalender" className="hover:text-[var(--color-primary)]">
          Kalender
        </Link>
        <span className="mx-1">/</span>
        <span>Neu</span>
      </nav>

      <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Termin anlegen</h1>

      {!hasScopeOptions ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          Keine Mannschaft oder Abteilung verfügbar, für die du einen Termin anlegen darfst.
        </p>
      ) : (
        <form action={createEventAction} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="scope" className="text-sm text-neutral-600">
              Für wen
            </label>
            <select
              id="scope"
              name="scope"
              required
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              {teams.length > 0 && (
                <optgroup label="Mannschaft">
                  {teams.map((team) => (
                    <option key={team.id} value={`team:${team.id}`}>
                      {team.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {departments.length > 0 && (
                <optgroup label="Abteilung">
                  {departments.map((department) => (
                    <option key={department.id} value={`department:${department.id}`}>
                      {department.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-sm text-neutral-600">
              Titel
            </label>
            <input
              id="title"
              name="title"
              required
              placeholder="z. B. Training"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="type" className="text-sm text-neutral-600">
              Art
            </label>
            <select
              id="type"
              name="type"
              defaultValue="OTHER"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <DateTimeInput name="startsAt" label="Beginn" required />
          <DateTimeInput name="endsAt" label="Ende" required />

          <div className="flex flex-col gap-1">
            <label htmlFor="venueId" className="text-sm text-neutral-600">
              Ort
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

          <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Termin anlegen
          </button>
        </form>
      )}
    </main>
  );
}
