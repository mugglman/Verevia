import Link from "next/link";
import { deleteEventAction, updateEventAction } from "@/app/actions";
import { DateTimeInput } from "./datetime-input";
import { EVENT_TYPE_LABELS, type EventOverviewType } from "./events-overview";

export interface EventDetailEvent {
  id: string;
  title: string;
  description: string | null;
  type: EventOverviewType;
  startsAt: string;
  endsAt: string;
  teamName: string | null;
  departmentName: string | null;
  seasonId: string | null;
  seasonName: string | null;
  venueId: string | null;
  venueName: string | null;
  canEdit: boolean;
}

export interface EventDetailVenue {
  id: string;
  name: string;
}

export interface EventDetailProps {
  event: EventDetailEvent;
  venues: EventDetailVenue[];
}

/** Pure presentational component — see apps/web/src/app/kalender/[id]/page.tsx. */
export function EventDetail({ event, venues }: EventDetailProps) {
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

      {!event.canEdit ? (
        <div className="space-y-1 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
          <p>
            {new Date(event.startsAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} –{" "}
            {new Date(event.endsAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
          </p>
          <p>{event.venueName ?? "Kein Ort angegeben"}</p>
          {event.seasonName && <p>Saison: {event.seasonName}</p>}
          {event.description && <p>{event.description}</p>}
        </div>
      ) : (
        <>
          <form action={updateEventAction.bind(null, event.id)} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="title" className="text-sm text-neutral-600">
                Titel
              </label>
              <input
                id="title"
                name="title"
                defaultValue={event.title}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="type" className="text-sm text-neutral-600">
                Art
              </label>
              <select
                id="type"
                name="type"
                defaultValue={event.type}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <DateTimeInput name="startsAt" label="Beginn" defaultValueIso={event.startsAt} required />
            <DateTimeInput name="endsAt" label="Ende" defaultValueIso={event.endsAt} required />

            <div className="flex flex-col gap-1">
              <label htmlFor="venueId" className="text-sm text-neutral-600">
                Ort
              </label>
              <select
                id="venueId"
                name="venueId"
                defaultValue={event.venueId ?? ""}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="">Keine Angabe</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="description" className="text-sm text-neutral-600">
                Beschreibung
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={event.description ?? ""}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Speichern
            </button>
          </form>

          <form action={deleteEventAction.bind(null, event.id)}>
            <button type="submit" className="text-sm font-medium text-red-600 hover:underline">
              Termin löschen
            </button>
          </form>
        </>
      )}
    </main>
  );
}
