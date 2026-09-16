import Link from "next/link";

export interface StatisticsTeamSeasonListItem {
  id: string;
  teamName: string;
  ageGroupName: string;
}

export interface StatisticsTeamSeasonListProps {
  teamSeasons: StatisticsTeamSeasonListItem[];
}

/** Pure presentational component — see apps/web/src/app/statistik/page.tsx. */
export function StatisticsTeamSeasonList({ teamSeasons }: StatisticsTeamSeasonListProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <span>Statistik</span>
      </nav>

      <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Statistik</h1>

      {teamSeasons.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          Keine Mannschaft verfügbar, für die du Statistiken sehen darfst.
        </p>
      ) : (
        <ul className="space-y-3">
          {teamSeasons.map((ts) => (
            <li key={ts.id}>
              <Link
                href={`/statistik/${ts.id}`}
                className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[var(--color-primary)]"
              >
                <p className="font-medium text-[var(--color-dark)]">
                  {ts.teamName} ({ts.ageGroupName})
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
