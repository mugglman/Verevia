import Link from "next/link";

export type EventOverviewType = "TRAINING" | "MEETING" | "OTHER";

export const EVENT_TYPE_LABELS: Record<EventOverviewType, string> = {
  TRAINING: "Training",
  MEETING: "Besprechung",
  OTHER: "Sonstiges",
};

export interface EventOverviewItem {
  id: string;
  title: string;
  type: EventOverviewType;
  startsAt: string;
  endsAt: string;
  teamName: string | null;
  departmentName: string | null;
  venueName: string | null;
}

export interface EventsOverviewProps {
  events: EventOverviewItem[];
  canCreate: boolean;
}

// Same deliberate MVP timezone strategy as MatchesOverview (Phase 10):
// storage is UTC, display is hardcoded Europe/Berlin.
function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return { date, time };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

/** Pure presentational component — see apps/web/src/app/kalender/page.tsx. */
export function EventsOverview({ events, canCreate }: EventsOverviewProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <span>Kalender</span>
      </nav>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Kalender</h1>
      </section>

      <section className="space-y-3">
        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">Noch keine Termine geplant.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => {
              const { date, time } = formatDateTime(event.startsAt);
              return (
                <li key={event.id}>
                  <Link
                    href={`/kalender/${event.id}`}
                    className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[var(--color-primary)]"
                  >
                    <p className="text-sm text-neutral-500">
                      {date} · {time} – {formatTime(event.endsAt)}
                    </p>
                    <p className="font-medium text-[var(--color-dark)]">{event.title}</p>
                    <p className="text-sm text-neutral-500">
                      {event.teamName ?? event.departmentName}
                      {event.venueName ? ` · ${event.venueName}` : ""}
                    </p>
                    <p className="text-sm text-neutral-500">{EVENT_TYPE_LABELS[event.type]}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {canCreate && (
          <Link href="/kalender/neu" className="inline-block rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Termin anlegen
          </Link>
        )}
      </section>
    </main>
  );
}
