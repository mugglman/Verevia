import Link from "next/link";
import { updateTeamNameAction } from "@/app/actions";

export interface TeamViewTeam {
  id: string;
  name: string;
  departmentId: string;
  canEdit: boolean;
}

export interface TeamViewProps {
  team: TeamViewTeam;
  departmentName: string | null;
}

/** Pure presentational component — see apps/web/src/app/mannschaften/[id]/page.tsx. */
export function TeamView({ team, departmentName }: TeamViewProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        {departmentName && (
          <>
            <span className="mx-1">/</span>
            <Link
              href={`/abteilungen/${team.departmentId}`}
              className="hover:text-[var(--color-primary)]"
            >
              {departmentName}
            </Link>
          </>
        )}
        <span className="mx-1">/</span>
        <span>{team.name}</span>
      </nav>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">{team.name}</h1>
        {team.canEdit && (
          <form
            action={updateTeamNameAction.bind(null, team.id)}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              name="name"
              defaultValue={team.name}
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              aria-label="Mannschaftsname"
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
    </main>
  );
}
