import { markEventAttendedAction, setEventRsvpAction } from "@/app/actions";

export type RsvpStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface AttendanceItem {
  personId: string;
  personName: string;
  rsvpStatus: RsvpStatus;
  rsvpNote: string | null;
  attended: boolean | null;
  isSelfOrGuardianTarget: boolean;
}

export interface AttendanceSectionProps {
  eventId: string;
  items: AttendanceItem[];
  canManageAttendance: boolean;
}

const RSVP_LABELS: Record<RsvpStatus, string> = {
  PENDING: "Keine Rückmeldung",
  ACCEPTED: "Zugesagt",
  DECLINED: "Abgesagt",
};

/**
 * Phase 19 — Anwesenheit. Zwei unabhängige Aktionsgruppen pro Zeile: die
 * Zu-/Absage (eigene Person oder verifiziertes Kind, `isSelfOrGuardianTarget`)
 * und die tatsächliche Anwesenheit im Nachhinein (nur Organisator,
 * `canManageAttendance`) — beide serverseitig durchgesetzt
 * (AttendancesService), diese Flags steuern nur, welche Buttons angezeigt
 * werden. Reine `<form>`-Submits, kein Client-JS, gleiches Muster wie
 * EventDetail/TournamentDetail.
 */
export function AttendanceSection({ eventId, items, canManageAttendance }: AttendanceSectionProps) {
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Anwesenheit</h2>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Keine Personen zugeordnet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {items.map((item) => (
            <li key={item.personId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-800">{item.personName}</p>
                <p className="text-xs text-neutral-500">
                  {RSVP_LABELS[item.rsvpStatus]}
                  {item.attended !== null ? (item.attended ? " · War anwesend" : " · War nicht anwesend") : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.isSelfOrGuardianTarget && (
                  <>
                    <form action={setEventRsvpAction.bind(null, eventId)}>
                      <input type="hidden" name="personId" value={item.personId} />
                      <input type="hidden" name="status" value="ACCEPTED" />
                      <button
                        type="submit"
                        aria-pressed={item.rsvpStatus === "ACCEPTED"}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          item.rsvpStatus === "ACCEPTED" ? "bg-[var(--color-primary)] text-white" : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                        }`}
                      >
                        Zusagen
                      </button>
                    </form>
                    <form action={setEventRsvpAction.bind(null, eventId)}>
                      <input type="hidden" name="personId" value={item.personId} />
                      <input type="hidden" name="status" value="DECLINED" />
                      <button
                        type="submit"
                        aria-pressed={item.rsvpStatus === "DECLINED"}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          item.rsvpStatus === "DECLINED" ? "bg-red-600 text-white" : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                        }`}
                      >
                        Absagen
                      </button>
                    </form>
                  </>
                )}
                {canManageAttendance && (
                  <>
                    <form action={markEventAttendedAction.bind(null, eventId)}>
                      <input type="hidden" name="personId" value={item.personId} />
                      <input type="hidden" name="attended" value="true" />
                      <button
                        type="submit"
                        aria-pressed={item.attended === true}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          item.attended === true ? "bg-[var(--color-primary)] text-white" : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                        }`}
                      >
                        War da
                      </button>
                    </form>
                    <form action={markEventAttendedAction.bind(null, eventId)}>
                      <input type="hidden" name="personId" value={item.personId} />
                      <input type="hidden" name="attended" value="false" />
                      <button
                        type="submit"
                        aria-pressed={item.attended === false}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          item.attended === false ? "bg-red-600 text-white" : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                        }`}
                      >
                        War nicht da
                      </button>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
