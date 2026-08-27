import Link from "next/link";
import { createVenueAction, updateVenueAction } from "@/app/actions";

export type VenueManagementStatus = "ACTIVE" | "INACTIVE";

const STATUS_LABELS: Record<VenueManagementStatus, string> = {
  ACTIVE: "Aktiv",
  INACTIVE: "Inaktiv",
};

export interface VenueManagementVenue {
  id: string;
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  status: VenueManagementStatus;
  canEdit: boolean;
}

export interface VenueManagementProps {
  venues: VenueManagementVenue[];
  canCreate: boolean;
}

function formatAddress(venue: VenueManagementVenue): string | null {
  const line = [venue.postalCode, venue.city].filter(Boolean).join(" ");
  const parts = [venue.street, line || null].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Pure presentational component — see apps/web/src/app/spielstaetten/page.tsx. */
export function VenueManagement({ venues, canCreate }: VenueManagementProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Verein
        </Link>
        <span className="mx-1">/</span>
        <span>Spielstätten</span>
      </nav>

      <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Spielstätten</h1>

      <section className="space-y-3">
        {venues.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Spielstätten angelegt.
          </p>
        ) : (
          <ul className="space-y-3">
            {venues.map((venue) => (
              <li key={venue.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-[var(--color-dark)]">{venue.name}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    {STATUS_LABELS[venue.status]}
                  </span>
                </div>
                {venue.canEdit ? (
                  <form
                    action={updateVenueAction.bind(null, venue.id)}
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    <input
                      name="name"
                      defaultValue={venue.name}
                      aria-label="Name der Spielstätte"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <input
                      name="street"
                      defaultValue={venue.street ?? ""}
                      placeholder="Straße"
                      aria-label="Straße"
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <input
                      name="postalCode"
                      defaultValue={venue.postalCode ?? ""}
                      placeholder="PLZ"
                      aria-label="Postleitzahl"
                      className="w-24 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <input
                      name="city"
                      defaultValue={venue.city ?? ""}
                      placeholder="Ort"
                      aria-label="Ort"
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <select
                      name="status"
                      defaultValue={venue.status}
                      aria-label="Status"
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    >
                      {(Object.keys(STATUS_LABELS) as VenueManagementStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      Speichern
                    </button>
                  </form>
                ) : (
                  formatAddress(venue) && <p className="mt-1 text-sm text-neutral-500">{formatAddress(venue)}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {canCreate && (
          <form
            action={createVenueAction}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <input
              name="name"
              placeholder="Name der neuen Spielstätte"
              required
              aria-label="Name der neuen Spielstätte"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <input
              name="street"
              placeholder="Straße"
              aria-label="Straße der neuen Spielstätte"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <input
              name="postalCode"
              placeholder="PLZ"
              aria-label="Postleitzahl der neuen Spielstätte"
              className="w-24 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <input
              name="city"
              placeholder="Ort"
              aria-label="Ort der neuen Spielstätte"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Spielstätte anlegen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
