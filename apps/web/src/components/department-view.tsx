import Link from "next/link";
import { createTeamAction, updateDepartmentNameAction } from "@/app/actions";

export interface DepartmentViewDepartment {
  id: string;
  name: string;
  canEdit: boolean;
  canCreateTeams: boolean;
}

export interface DepartmentViewTeam {
  id: string;
  name: string;
}

export interface DepartmentViewProps {
  department: DepartmentViewDepartment;
  teams: DepartmentViewTeam[];
}

/** Pure presentational component — see apps/web/src/app/abteilungen/[id]/page.tsx. */
export function DepartmentView({ department, teams }: DepartmentViewProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <span>{department.name}</span>
      </nav>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">{department.name}</h1>
        {department.canEdit && (
          <form
            action={updateDepartmentNameAction.bind(null, department.id)}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              name="name"
              defaultValue={department.name}
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              aria-label="Abteilungsname"
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
          Mannschaften
        </h2>

        {teams.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Mannschaften vorhanden.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {teams.map((team) => (
              <li key={team.id}>
                <Link
                  href={`/mannschaften/${team.id}`}
                  className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[var(--color-primary)]"
                >
                  <span className="font-medium text-[var(--color-dark)]">{team.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {department.canCreateTeams && (
          <form
            action={createTeamAction.bind(null, department.id)}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <input
              name="name"
              placeholder="Neue Mannschaft (z. B. E1)"
              required
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              aria-label="Name der neuen Mannschaft"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Mannschaft anlegen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
