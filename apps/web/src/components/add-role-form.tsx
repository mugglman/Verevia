"use client";

import { useState } from "react";
import { grantRoleAction } from "@/app/actions";
import { ALL_ROLES, ROLE_LABELS, ROLE_SCOPE, type RoleName } from "@/lib/roles";

const DEFAULT_ROLE: RoleName = ALL_ROLES[0] ?? "MEMBER";

export interface AddRoleFormDepartment {
  id: string;
  name: string;
}

export interface AddRoleFormTeam {
  id: string;
  name: string;
}

export interface AddRoleFormProps {
  personId: string;
  departments: AddRoleFormDepartment[];
  teams: AddRoleFormTeam[];
}

/**
 * Client island: the only place in this app that needs client-side
 * interactivity so far — which scope picker (Abteilung/Mannschaft/none) to
 * show depends on the selected role (Phase 5, section 21: "Nur gültige
 * Kombinationen auswählbar machen"). The actual mutation still runs
 * through the real server action (`grantRoleAction`), which re-derives and
 * validates everything server-side — this component only drives display.
 */
export function AddRoleForm({ personId, departments, teams }: AddRoleFormProps) {
  const [role, setRole] = useState<RoleName>(DEFAULT_ROLE);
  const scope = ROLE_SCOPE[role];

  return (
    <form
      action={grantRoleAction.bind(null, personId)}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
    >
      <select
        name="role"
        value={role}
        onChange={(event) => setRole(event.target.value as RoleName)}
        aria-label="Rolle"
        className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
      >
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>

      {scope === "DEPARTMENT" && (
        <select
          name="departmentId"
          required
          aria-label="Abteilung auswählen"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}

      {scope === "TEAM" && (
        <select
          name="teamId"
          required
          aria-label="Mannschaft auswählen"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      <button
        type="submit"
        className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
      >
        Rolle hinzufügen
      </button>
    </form>
  );
}
