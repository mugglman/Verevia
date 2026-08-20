import Link from "next/link";
import { createDepartmentAction, updateClubNameAction } from "@/app/actions";

export interface ClubOverviewClub {
  id: string;
  name: string;
  slug: string;
  canEdit: boolean;
}

export interface ClubOverviewDepartment {
  id: string;
  name: string;
  canEdit: boolean;
}

export interface ClubOverviewProps {
  club: ClubOverviewClub;
  departments: ClubOverviewDepartment[];
  canCreateDepartment: boolean;
}

/** Pure presentational component — see apps/web/src/app/page.tsx for the data-fetching wrapper. */
export function ClubOverview({ club, departments, canCreateDepartment }: ClubOverviewProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">{club.name}</h1>
        {club.canEdit && (
          <form action={updateClubNameAction} className="flex flex-wrap items-center gap-2">
            <input
              name="name"
              defaultValue={club.name}
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              aria-label="Vereinsname"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Speichern
            </button>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Abteilungen
        </h2>

        {departments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Abteilungen vorhanden.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {departments.map((department) => (
              <li key={department.id}>
                <Link
                  href={`/abteilungen/${department.id}`}
                  className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[var(--color-primary)]"
                >
                  <span className="font-medium text-[var(--color-dark)]">{department.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {canCreateDepartment && (
          <form
            action={createDepartmentAction}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <input
              name="name"
              placeholder="Neue Abteilung (z. B. Tennis)"
              required
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              aria-label="Name der neuen Abteilung"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Abteilung anlegen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
