import Link from "next/link";
import { AttendanceSection, type AttendanceItem } from "./attendance-section";
import { EVENT_TYPE_LABELS, type EventOverviewType } from "./events-overview";

export interface AttendanceOnlyEvent {
  id: string;
  title: string;
  description: string | null;
  type: EventOverviewType;
  startsAt: string;
  endsAt: string;
  teamName: string | null;
  departmentName: string | null;
  venueName: string | null;
}

export interface AttendanceOnlyEventViewProps {
  event: AttendanceOnlyEvent;
  items: AttendanceItem[];
  canManageAttendance: boolean;
}

/**
 * Reduzierte Terminansicht (Phase 19) für Aufrufer ohne RBAC-Leserecht auf
 * das Event selbst (siehe EventsService.canAccess), aber mit
 * Self-Service-Zugriff auf die Anwesenheit — typischerweise ein
 * Erziehungsberechtigter ohne eigene Rolle, dessen Kind auf dem Roster des
 * Termins steht (siehe ADR 0015). Zeigt ausschließlich die für die
 * Rückmeldung nötigen Informationen (Titel, Zeit, Ort, Beschreibung) —
 * keine Bearbeiten-/Löschen-Formulare, die serverseitig ohnehin verboten
 * wären. Bewusst eine eigene, kleine Komponente statt einer Erweiterung von
 * `EventDetail`: unterschiedliche Datengrundlage (kein `canEdit`, keine
 * Saison-/Venue-IDs für ein Auswahlformular) und unterschiedlicher Zweck.
 */
export function AttendanceOnlyEventView({ event, items, canManageAttendance }: AttendanceOnlyEventViewProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <Link href="/kalender" className="hover:text-[var(--color-primary)]">
          Kalender
        </Link>
        <span className="mx-1">/</span>
        <span>{event.title}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">{event.title}</h1>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">{EVENT_TYPE_LABELS[event.type]}</span>
      </div>
      <p className="text-sm text-neutral-500">{event.teamName ?? event.departmentName}</p>

      <div className="space-y-1 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        <p>
          {new Date(event.startsAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} –{" "}
          {new Date(event.endsAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
        </p>
        <p>{event.venueName ?? "Kein Ort angegeben"}</p>
        {event.description && <p>{event.description}</p>}
      </div>

      <AttendanceSection eventId={event.id} items={items} canManageAttendance={canManageAttendance} />
    </main>
  );
}
