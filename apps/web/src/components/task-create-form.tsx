import Link from "next/link";
import { createTaskAction } from "@/app/actions";

export interface TaskCreateFormTeam {
  id: string;
  name: string;
}

export interface TaskCreateFormPerson {
  id: string;
  name: string;
}

export interface TaskCreateFormProps {
  teams: TaskCreateFormTeam[];
  persons: TaskCreateFormPerson[];
}

/**
 * Pure presentational component — see apps/web/src/app/aufgaben/neu/page.tsx.
 * "Für wen" is a single select combining teams and persons (prefixed
 * `team:`/`person:` values) rather than two separate selects — a task
 * belongs to exactly one of them (task_assignee_xor), same pattern as
 * EventCreateForm's team/department select (Phase 18).
 */
export function TaskCreateForm({ teams, persons }: TaskCreateFormProps) {
  const hasScopeOptions = teams.length > 0 || persons.length > 0;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <Link href="/aufgaben" className="hover:text-[var(--color-primary)]">
          Aufgaben
        </Link>
        <span className="mx-1">/</span>
        <span>Neu</span>
      </nav>

      <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Aufgabe anlegen</h1>

      {!hasScopeOptions ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          Keine Mannschaft oder Person verfügbar, für die du eine Aufgabe anlegen darfst.
        </p>
      ) : (
        <form action={createTaskAction} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
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
              {persons.length > 0 && (
                <optgroup label="Person">
                  {persons.map((person) => (
                    <option key={person.id} value={`person:${person.id}`}>
                      {person.name}
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
              placeholder="z. B. Trikots waschen"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="dueAt" className="text-sm text-neutral-600">
              Fällig am
            </label>
            <input
              id="dueAt"
              name="dueAt"
              type="date"
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

          <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Aufgabe anlegen
          </button>
        </form>
      )}
    </main>
  );
}
