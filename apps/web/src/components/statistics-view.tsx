import Link from "next/link";
import type { ReactNode } from "react";

export interface StatisticsViewMatches {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface StatisticsViewAttendance {
  eventCount: number;
  accepted: number;
  declined: number;
  pending: number;
  attended: number;
  notAttended: number;
  notRecorded: number;
  attendanceRate: number | null;
}

export interface StatisticsViewData {
  teamSeasonId: string;
  teamId: string;
  teamName: string;
  seasonId: string;
  seasonName: string;
  matches: StatisticsViewMatches;
  attendance: StatisticsViewAttendance;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      aria-label={`${label}: ${value}`}
      className="flex flex-col items-center gap-1 rounded-xl bg-neutral-50 p-3 text-center dark:bg-neutral-900"
    >
      <span className="text-lg font-semibold text-[var(--color-dark)] dark:text-white">{value}</span>
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Phase 21 — reine Anzeige, keine eigene Berechnung. Genau die drei Karten
 * aus dem Arbeitsauftrag (Abschnitt 12): Spielbilanz, Torbilanz,
 * Anwesenheit. Bewusst schlicht gehalten — kein Dashboard-Look.
 */
export function StatisticsView({ data }: { data: StatisticsViewData }) {
  const { matches, attendance } = data;
  const attendanceRateLabel =
    attendance.attendanceRate === null ? "–" : `${Math.round(attendance.attendanceRate * 100)}%`;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <Link href="/statistik" className="hover:text-[var(--color-primary)]">
          Statistik
        </Link>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-dark)] dark:text-white">{data.teamName}</h1>
        <p className="text-sm text-neutral-500">{data.seasonName}</p>
      </div>

      <Card title="Spielbilanz">
        <div className="grid grid-cols-4 gap-2">
          <Metric label="Spiele" value={matches.played} />
          <Metric label="Siege" value={matches.wins} />
          <Metric label="Unentschieden" value={matches.draws} />
          <Metric label="Niederlagen" value={matches.losses} />
        </div>
      </Card>

      <Card title="Torbilanz">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Tore" value={matches.goalsFor} />
          <Metric label="Gegentore" value={matches.goalsAgainst} />
          <Metric
            label="Tordifferenz"
            value={matches.goalDifference > 0 ? `+${matches.goalDifference}` : matches.goalDifference}
          />
        </div>
      </Card>

      <Card title="Anwesenheit">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Termine" value={attendance.eventCount} />
          <Metric label="Anwesend" value={attendance.attended} />
          <Metric label="Abwesend" value={attendance.notAttended} />
          <Metric label="Offen" value={attendance.notRecorded} />
          <Metric label="Zusagen" value={attendance.accepted} />
          <Metric label="Absagen" value={attendance.declined} />
        </div>
        <div className="mt-3 rounded-xl bg-[var(--color-primary)]/10 p-3 text-center">
          <span className="text-lg font-semibold text-[var(--color-dark)] dark:text-white">{attendanceRateLabel}</span>
          <span className="ml-2 text-xs text-neutral-500">Anwesenheitsquote</span>
        </div>
      </Card>
    </main>
  );
}
