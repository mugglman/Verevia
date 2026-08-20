import { createPersonAction, updatePersonAction } from "@/app/actions";

export interface PersonManagementPerson {
  id: string;
  firstName: string;
  lastName: string;
  canEdit: boolean;
}

export interface PersonManagementProps {
  persons: PersonManagementPerson[];
  canCreate: boolean;
}

/**
 * Pure presentational component — see apps/web/src/app/personen/page.tsx.
 * Bewusst datensparsam/einfach gehalten (Phase 4, section 18): nur
 * Vor-/Nachname editierbar, kein Massenimport, kein CSV, keine
 * Einladungsmails.
 */
export function PersonManagement({ persons, canCreate }: PersonManagementProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Personen</h1>
      </section>

      <section className="space-y-3">
        {persons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Personen vorhanden.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {persons.map((person) => (
              <li
                key={person.id}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                {person.canEdit ? (
                  <form
                    action={updatePersonAction.bind(null, person.id)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      name="firstName"
                      defaultValue={person.firstName}
                      aria-label="Vorname"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <input
                      name="lastName"
                      defaultValue={person.lastName}
                      aria-label="Nachname"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      Speichern
                    </button>
                  </form>
                ) : (
                  <span className="font-medium text-[var(--color-dark)]">
                    {person.firstName} {person.lastName}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {canCreate && (
          <form
            action={createPersonAction}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <input
              name="firstName"
              placeholder="Vorname"
              required
              aria-label="Vorname der neuen Person"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <input
              name="lastName"
              placeholder="Nachname"
              required
              aria-label="Nachname der neuen Person"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Person anlegen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
