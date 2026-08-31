import { GroupStandingsTable, type GroupStandingsTableRow } from "./group-standings-table";
import { TOURNAMENT_MODE_LABELS, TOURNAMENT_STATUS_LABELS, type TournamentOverviewMode, type TournamentOverviewStatus } from "./tournaments-overview";

export interface PublicTournamentViewParticipant {
  id: string;
  label: string;
  groupId: string | null;
  groupName: string | null;
  status: "ACTIVE" | "WITHDRAWN";
}

export interface PublicTournamentViewGroup {
  id: string;
  name: string;
  displayOrder: number;
  standings: GroupStandingsTableRow[];
  isComplete: boolean;
}

export interface PublicTournamentViewMatch {
  id: string;
  startsAt: string;
  status: "SCHEDULED" | "POSTPONED" | "CANCELLED" | "COMPLETED";
  homeLabel: string | null;
  awayLabel: string | null;
  homeScore: number | null;
  awayScore: number | null;
  groupName: string | null;
  venueName: string | null;
}

export interface PublicTournamentViewTournament {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  status: TournamentOverviewStatus;
  mode: TournamentOverviewMode;
  departmentName: string | null;
}

export interface PublicTournamentViewProps {
  tournament: PublicTournamentViewTournament;
  participants: PublicTournamentViewParticipant[];
  groups: PublicTournamentViewGroup[];
  matches: PublicTournamentViewMatch[];
}

const MATCH_STATUS_LABELS: Record<PublicTournamentViewMatch["status"], string> = {
  SCHEDULED: "Geplant",
  POSTPONED: "Verschoben",
  CANCELLED: "Abgesagt",
  COMPLETED: "Beendet",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} · ${time}`;
}

/**
 * Phase 17 — pure, read-only rendering of the public tournament page
 * (Roadmap.md "öffentliche Turnierseite" / MVP-Scope.md item 17). No edit
 * forms, no management affordances, no `canEdit` anywhere in this
 * component's props — this is intentionally a strict subset of what
 * TournamentDetail can render, not a variant of it. Group standings reuse
 * the same shared GroupStandingsTable as the authenticated page (same
 * computation on the API side, ADR 0012 — no second rendering either).
 */
export function PublicTournamentView({ tournament, participants, groups, matches }: PublicTournamentViewProps) {
  const participantLabel = (participantId: string) => participants.find((p) => p.id === participantId)?.label ?? "";

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">{tournament.name}</h1>
        <p className="text-sm text-neutral-500">
          {tournament.departmentName ? `${tournament.departmentName} · ` : ""}
          {formatDate(tournament.startsAt)}
          {tournament.endsAt ? ` – ${formatDate(tournament.endsAt)}` : ""}
          {" · "}
          {TOURNAMENT_STATUS_LABELS[tournament.status]}
          {tournament.mode ? ` · ${TOURNAMENT_MODE_LABELS[tournament.mode]}` : ""}
        </p>
        {tournament.description && <p className="text-sm text-neutral-600">{tournament.description}</p>}
      </section>

      {groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Gruppen</h2>
          <ul className="space-y-3">
            {groups.map((group) => {
              const hasStandings = group.standings.length > 0 && group.standings.some((row) => row.played > 0);
              return (
                <li key={group.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--color-dark)]">{group.name}</span>
                    {hasStandings && <span className="text-xs text-neutral-500">{group.isComplete ? "Endstand" : "Zwischenstand"}</span>}
                  </div>
                  {hasStandings ? (
                    <GroupStandingsTable standings={group.standings} participantLabel={participantLabel} />
                  ) : (
                    <ul className="mt-1 space-y-0.5 text-sm text-neutral-500">
                      {participants
                        .filter((p) => p.groupId === group.id)
                        .map((p) => (
                          <li key={p.id}>{p.label}</li>
                        ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Teilnehmer</h2>
        {participants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">Noch keine Teilnehmer.</p>
        ) : (
          <ul className="space-y-2">
            {participants.map((p) => (
              <li key={p.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                <span className="font-medium text-[var(--color-dark)]">{p.label}</span>
                {p.status === "WITHDRAWN" && (
                  <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">Zurückgezogen</span>
                )}
                {p.groupName && <span className="ml-2 text-sm text-neutral-500">{p.groupName}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Spiele</h2>
        {matches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">Noch keine Spiele angelegt.</p>
        ) : (
          <ul className="space-y-2">
            {matches.map((match) => {
              const hasResult = match.status === "COMPLETED" && match.homeScore != null && match.awayScore != null;
              const isDraw = hasResult && match.homeScore === match.awayScore;
              const homeWon = hasResult && !isDraw && match.homeScore! > match.awayScore!;
              const awayWon = hasResult && !isDraw && match.awayScore! > match.homeScore!;
              return (
                <li key={match.id} className="rounded-2xl border border-neutral-200 bg-white p-3">
                  <p className="text-sm text-neutral-500">{formatDateTime(match.startsAt)}</p>
                  <p className="font-medium text-[var(--color-dark)]">
                    <span className={homeWon ? "font-semibold" : undefined}>{match.homeLabel}</span>
                    {" – "}
                    <span className={awayWon ? "font-semibold" : undefined}>{match.awayLabel}</span>
                    {hasResult ? ` ${match.homeScore}:${match.awayScore}` : ""}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {match.groupName ?? "Ohne Gruppe"}
                    {match.venueName ? ` · ${match.venueName}` : ""}
                    {match.status !== "SCHEDULED" ? ` · ${MATCH_STATUS_LABELS[match.status]}` : ""}
                  </p>
                  {isDraw && <p className="text-sm text-neutral-500">Unentschieden</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
