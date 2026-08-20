import Link from "next/link";
import { addTeamMemberAction, removeTeamMemberAction, updateTeamNameAction } from "@/app/actions";

export interface TeamViewTeam {
  id: string;
  name: string;
  departmentId: string;
  canEdit: boolean;
}

export interface TeamViewMember {
  personId: string;
  firstName: string;
  lastName: string;
}

export interface TeamViewCandidatePerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TeamViewProps {
  team: TeamViewTeam;
  departmentName: string | null;
  members: TeamViewMember[];
  canManageMembers: boolean;
  /** Personen, die noch nicht aktives Mitglied dieser Mannschaft sind — nur gesetzt, wenn canManageMembers. */
  candidatePersons?: TeamViewCandidatePerson[];
}

/** Pure presentational component — see apps/web/src/app/mannschaften/[id]/page.tsx. */
export function TeamView({
  team,
  departmentName,
  members,
  canManageMembers,
  candidatePersons,
}: TeamViewProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
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

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Mitglieder</h2>

        {members.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Mitglieder in dieser Mannschaft.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {members.map((member) => (
              <li
                key={member.personId}
                className="flex items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <span className="font-medium text-[var(--color-dark)]">
                  {member.firstName} {member.lastName}
                </span>
                {canManageMembers && (
                  <form action={removeTeamMemberAction.bind(null, team.id, member.personId)}>
                    <button
                      type="submit"
                      className="text-xs text-neutral-500 hover:text-red-600"
                      aria-label={`${member.firstName} ${member.lastName} entfernen`}
                    >
                      Entfernen
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManageMembers && candidatePersons && (
          <form
            action={addTeamMemberAction.bind(null, team.id)}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            {candidatePersons.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Keine weiteren Personen verfügbar. Lege zunächst eine Person in der
                Personenverwaltung an.
              </p>
            ) : (
              <>
                <select
                  name="personId"
                  required
                  aria-label="Person hinzufügen"
                  className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                >
                  {candidatePersons.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.firstName} {person.lastName}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Person hinzufügen
                </button>
              </>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
