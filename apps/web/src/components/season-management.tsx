import Link from "next/link";
import { createSeasonAction, updateSeasonAction } from "@/app/actions";

export type SeasonManagementStatus = "PLANNED" | "ACTIVE" | "COMPLETED";

const STATUS_LABELS: Record<SeasonManagementStatus, string> = {
  PLANNED: "Geplant",
  ACTIVE: "Aktiv",
  COMPLETED: "Abgeschlossen",
};

export interface SeasonManagementSeason {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonManagementStatus;
  canEdit: boolean;
}

export interface SeasonManagementProps {
  departmentId: string;
  departmentName: string;
  canCreate: boolean;
  seasons: SeasonManagementSeason[];
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/** Pure presentational component — see apps/web/src/app/fussball/saisons/page.tsx. */
export function SeasonManagement({ departmentId, departmentName, canCreate, seasons }: SeasonManagementProps) {
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
        <span>Saisons</span>
      </nav>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Saisons – {departmentName}</h1>
      </section>

      <section className="space-y-3">
        {seasons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Saisons vorhanden.
          </p>
        ) : (
          <ul className="space-y-3">
            {seasons.map((season) => (
              <li
                key={season.id}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-[var(--color-dark)]">{season.name}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    {STATUS_LABELS[season.status]}
                  </span>
                </div>
                {season.canEdit ? (
                  <form
                    action={updateSeasonAction.bind(null, season.id)}
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    <input
                      name="name"
                      defaultValue={season.name}
                      aria-label="Saisonname"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <input
                      type="date"
                      name="startsAt"
                      defaultValue={toDateInputValue(season.startsAt)}
                      aria-label="Beginn"
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <input
                      type="date"
                      name="endsAt"
                      defaultValue={toDateInputValue(season.endsAt)}
                      aria-label="Ende"
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <select
                      name="status"
                      defaultValue={season.status}
                      aria-label="Status"
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    >
                      {(Object.keys(STATUS_LABELS) as SeasonManagementStatus[]).map((status) => (
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
                  <p className="mt-1 text-sm text-neutral-500">
                    {toDateInputValue(season.startsAt)} – {toDateInputValue(season.endsAt)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {canCreate && (
          <form
            action={createSeasonAction.bind(null, departmentId)}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <input
              name="name"
              placeholder="Saisonname (z. B. 2026/2027)"
              required
              aria-label="Name der neuen Saison"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <input
              type="date"
              name="startsAt"
              required
              aria-label="Beginn der neuen Saison"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <input
              type="date"
              name="endsAt"
              required
              aria-label="Ende der neuen Saison"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Saison anlegen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
