import Link from "next/link";

export type MatchOverviewType = "LEAGUE" | "FRIENDLY" | "TOURNAMENT" | "CUP";
export type MatchOverviewHomeAway = "HOME" | "AWAY" | "NEUTRAL";
export type MatchOverviewStatus = "SCHEDULED" | "POSTPONED" | "CANCELLED" | "COMPLETED";

export const MATCH_TYPE_LABELS: Record<MatchOverviewType, string> = {
  LEAGUE: "Ligaspiel",
  FRIENDLY: "Freundschaftsspiel",
  TOURNAMENT: "Turnierspiel",
  CUP: "Pokalspiel",
};

export const MATCH_HOME_AWAY_LABELS: Record<MatchOverviewHomeAway, string> = {
  HOME: "Heimspiel",
  AWAY: "Auswärtsspiel",
  NEUTRAL: "Neutraler Platz",
};

export const MATCH_STATUS_LABELS: Record<MatchOverviewStatus, string> = {
  SCHEDULED: "Geplant",
  POSTPONED: "Verschoben",
  CANCELLED: "Abgesagt",
  COMPLETED: "Abgeschlossen",
};

export interface MatchOverviewItem {
  id: string;
  teamName: string;
  venueName: string | null;
  startsAt: string;
  type: MatchOverviewType;
  status: MatchOverviewStatus;
  homeAway: MatchOverviewHomeAway;
  opponentName: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface MatchesOverviewProps {
  departmentName: string;
  matches: MatchOverviewItem[];
  canCreate: boolean;
}

// Deliberate MVP timezone strategy (Phase 10): storage is always UTC
// (`startsAt` is a plain UTC instant, converted from the browser's local
// time at submission — see MatchDateTimeInput), display is hardcoded to
// Europe/Berlin rather than per-viewer "client timezone" detection —
// Verevia is a German-only pilot with no multi-region users yet, so this
// avoids the added complexity of client-side timezone-aware rendering for
// a distinction that doesn't exist in practice yet. Documented so this is
// a deliberate, revisitable choice, not naive date handling.
function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return { date, time };
}

function matchup(teamName: string, opponentName: string, homeAway: MatchOverviewHomeAway): string {
  if (homeAway === "AWAY") return `${opponentName} – ${teamName}`;
  return `${teamName} – ${opponentName}`;
}

/** Pure presentational component — see apps/web/src/app/fussball/spiele/page.tsx. */
export function MatchesOverview({ departmentName, matches, canCreate }: MatchesOverviewProps) {
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
        <span>Spiele</span>
      </nav>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Spiele – {departmentName}</h1>
      </section>

      <section className="space-y-3">
        {matches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Spiele geplant.
          </p>
        ) : (
          <ul className="space-y-3">
            {matches.map((match) => {
              const { date, time } = formatDateTime(match.startsAt);
              return (
                <li key={match.id}>
                  <Link
                    href={`/fussball/spiele/${match.id}`}
                    className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[var(--color-primary)]"
                  >
                    <p className="text-sm text-neutral-500">
                      {date} · {time}
                    </p>
                    <p className="font-medium text-[var(--color-dark)]">
                      {matchup(match.teamName, match.opponentName, match.homeAway)}
                      {match.status === "COMPLETED" && match.homeScore != null && match.awayScore != null
                        ? ` ${match.homeScore}:${match.awayScore}`
                        : ""}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {MATCH_HOME_AWAY_LABELS[match.homeAway]}
                      {match.venueName ? ` · ${match.venueName}` : ""}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {MATCH_TYPE_LABELS[match.type]}
                      {match.status !== "SCHEDULED" ? ` · ${MATCH_STATUS_LABELS[match.status]}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {canCreate && (
          <Link
            href="/fussball/spiele/neu"
            className="inline-block rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Spiel anlegen
          </Link>
        )}
      </section>
    </main>
  );
}
