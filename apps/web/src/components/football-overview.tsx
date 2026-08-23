import Link from "next/link";

export interface FootballOverviewDepartment {
  id: string;
  name: string;
  canManage: boolean;
}

export interface FootballOverviewSeason {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
}

export interface FootballOverviewTeamSeason {
  id: string;
  teamId: string;
  teamName: string;
  ageGroupName: string;
  displayName: string | null;
}

export interface FootballOverviewProps {
  department: FootballOverviewDepartment | null;
  activeSeason: FootballOverviewSeason | null;
  teamSeasons: FootballOverviewTeamSeason[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Pure presentational component — see apps/web/src/app/fussball/page.tsx. */
export function FootballOverview({ department, activeSeason, teamSeasons }: FootballOverviewProps) {
  if (!department) {
    return (
      <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Fußball</h1>
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          Noch keine Fußballabteilung eingerichtet.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <span>Fußball</span>
      </nav>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Fußball</h1>
        {activeSeason ? (
          <p className="text-sm text-neutral-600">
            Aktive Saison: <span className="font-medium text-[var(--color-dark)]">{activeSeason.name}</span> (
            {formatDate(activeSeason.startsAt)} – {formatDate(activeSeason.endsAt)})
          </p>
        ) : (
          <p className="text-sm text-neutral-500">Keine aktive Saison.</p>
        )}
        {department.canManage && (
          <Link
            href="/fussball/saisons"
            className="inline-block text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            Saisons verwalten
          </Link>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Mannschaften</h2>
        {!activeSeason ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Keine aktive Saison, daher noch keine Mannschaften zugeordnet.
          </p>
        ) : teamSeasons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Mannschaften für diese Saison zugeordnet.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {teamSeasons.map((teamSeason) => (
              <li key={teamSeason.id}>
                <Link
                  href={`/mannschaften/${teamSeason.teamId}`}
                  className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[var(--color-primary)]"
                >
                  <span className="font-medium text-[var(--color-dark)]">
                    {teamSeason.displayName ?? teamSeason.teamName}
                  </span>
                  <span className="block text-sm text-neutral-500">{teamSeason.ageGroupName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
