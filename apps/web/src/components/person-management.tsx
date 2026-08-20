import { createPersonAction, revokeRoleAction, updatePersonAction } from "@/app/actions";
import { AddRoleForm, type AddRoleFormDepartment, type AddRoleFormTeam } from "@/components/add-role-form";
import { formatRoleLabel } from "@/lib/roles";

export interface PersonManagementRole {
  id: string;
  role: string;
  departmentName: string | null;
  teamName: string | null;
  /**
   * True when this is the tenant's only TENANT_ADMIN/TENANT assignment —
   * computed by the page wrapper across all persons. A simple count
   * approximation for the UI (Phase 5, section 22); the server remains
   * authoritative (409 on removal) since it additionally checks whether
   * the underlying Person actually has a usable, ACTIVE Membership.
   */
  isLastTenantAdmin?: boolean;
}

export interface PersonManagementPerson {
  id: string;
  firstName: string;
  lastName: string;
  canEdit: boolean;
  /** Only present when the viewer may manage roles (TENANT_ADMIN) — see apps/web/src/app/personen/page.tsx. */
  roles?: PersonManagementRole[];
}

export interface PersonManagementProps {
  persons: PersonManagementPerson[];
  canCreate: boolean;
  /** Only needed for the "Rolle hinzufügen" picker — empty when the viewer cannot manage roles. */
  departments: AddRoleFormDepartment[];
  teams: AddRoleFormTeam[];
}

/**
 * Pure presentational component — see apps/web/src/app/personen/page.tsx.
 * Bewusst datensparsam/einfach gehalten (Phase 4, section 18 / Phase 5,
 * section 23): nur Vor-/Nachname editierbar, ausschließlich definierte
 * Rollen + Scope verwaltbar — kein Massenimport, keine Berechtigungs-
 * Matrix-UI, kein Rollen-Designer.
 */
export function PersonManagement({ persons, canCreate, departments, teams }: PersonManagementProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-dark)]">Personen</h1>
      </section>

      <section className="space-y-3">
        {persons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Noch keine Personen vorhanden.
          </p>
        ) : (
          <ul className="space-y-3">
            {persons.map((person) => (
              <li
                key={person.id}
                className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                {person.canEdit ? (
                  <form
                    action={updatePersonAction.bind(null, person.id)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      name="firstName"
                      defaultValue={person.firstName}
                      aria-label="Vorname"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <input
                      name="lastName"
                      defaultValue={person.lastName}
                      aria-label="Nachname"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      Speichern
                    </button>
                  </form>
                ) : (
                  <span className="font-medium text-[var(--color-dark)]">
                    {person.firstName} {person.lastName}
                  </span>
                )}

                {person.roles !== undefined && (
                  <div className="space-y-2 border-t border-neutral-100 pt-3">
                    <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Rollen &amp; Berechtigungen
                    </h2>
                    {person.roles.length === 0 ? (
                      <p className="text-sm text-neutral-500">Keine Rollen zugewiesen.</p>
                    ) : (
                      <ul className="space-y-1">
                        {person.roles.map((role) => (
                          <li
                            key={role.id}
                            className="flex items-center justify-between gap-2 text-sm text-[var(--color-dark)]"
                          >
                            <span>{formatRoleLabel(role.role, role.departmentName, role.teamName)}</span>
                            {role.isLastTenantAdmin ? (
                              <span className="text-xs text-neutral-400" title="Mindestens ein Vereinsadministrator ist erforderlich">
                                Letzter Vereinsadministrator
                              </span>
                            ) : (
                              <form action={revokeRoleAction.bind(null, person.id, role.id)}>
                                <button
                                  type="submit"
                                  className="text-xs text-neutral-500 hover:text-red-600"
                                  aria-label={`${formatRoleLabel(role.role, role.departmentName, role.teamName)} entfernen`}
                                >
                                  Entfernen
                                </button>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <AddRoleForm personId={person.id} departments={departments} teams={teams} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canCreate && (
          <form
            action={createPersonAction}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <input
              name="firstName"
              placeholder="Vorname"
              required
              aria-label="Vorname der neuen Person"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <input
              name="lastName"
              placeholder="Nachname"
              required
              aria-label="Nachname der neuen Person"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Person anlegen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
