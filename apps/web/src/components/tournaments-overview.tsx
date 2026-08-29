import Link from "next/link";

export type TournamentOverviewStatus = "DRAFT" | "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type TournamentOverviewMode = "GROUPS" | "KNOCKOUT" | "GROUPS_AND_KNOCKOUT" | null;

export const TOURNAMENT_STATUS_LABELS: Record<TournamentOverviewStatus, string> = {
  DRAFT: "Entwurf",
  PLANNED: "Geplant",
  ACTIVE: "Läuft",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgesagt",
};

export const TOURNAMENT_MODE_LABELS: Record<Exclude<TournamentOverviewMode, null>, string> = {
  GROUPS: "Gruppenphase",
  KNOCKOUT: "K.-o.-System",
  GROUPS_AND_KNOCKOUT: "Gruppen + K.-o.",
};

export interface TournamentOverviewItem {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  status: TournamentOverviewStatus;
  mode: TournamentOverviewMode;
  participantCount: number;
  groupCount: number;
}

export interface TournamentsOverviewProps {
  departmentName: string;
  tournaments: TournamentOverviewItem[];
  canCreate: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

/** Pure presentational component — see apps/web/src/app/fussball/turniere/page.tsx. */
export function TournamentsOverview({ departmentName, tournaments, canCreate }: TournamentsOverviewProps) {
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
        <span>Turniere</span>
      </nav>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Turniere – {departmentName}</h1>
      </section>

      <section className="space-y-3">
        {tournaments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Turniere angelegt.
          </p>
        ) : (
          <ul className="space-y-3">
            {tournaments.map((tournament) => (
              <li key={tournament.id}>
                <Link
                  href={`/fussball/turniere/${tournament.id}`}
                  className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[var(--color-primary)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-dark)]">{tournament.name}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                      {TOURNAMENT_STATUS_LABELS[tournament.status]}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500">
                    {formatDate(tournament.startsAt)}
                    {tournament.endsAt ? ` – ${formatDate(tournament.endsAt)}` : ""}
                    {tournament.mode ? ` · ${TOURNAMENT_MODE_LABELS[tournament.mode]}` : ""}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {tournament.participantCount} Teilnehmer
                    {tournament.groupCount > 0 ? ` · ${tournament.groupCount} Gruppen` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {canCreate && (
          <Link
            href="/fussball/turniere/neu"
            className="inline-block rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Turnier anlegen
          </Link>
        )}
      </section>
    </main>
  );
}
