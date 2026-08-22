import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import {
  PersonManagement,
  type PersonManagementInvitation,
  type PersonManagementPerson,
  type PersonManagementRelationship,
  type PersonManagementRole,
} from "@/components/person-management";
import type { AddRoleFormDepartment, AddRoleFormTeam } from "@/components/add-role-form";

export const dynamic = "force-dynamic";

interface PersonListResponse {
  items: PersonManagementPerson[];
  canCreate: boolean;
}

interface DepartmentListResponse {
  items: AddRoleFormDepartment[];
  canCreate: boolean;
}

export default async function PersonenPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const personsResult = await apiFetch<PersonListResponse>("/api/v1/persons", tenantId);
  if (!personsResult.ok) {
    if (personsResult.status === 401) {
      redirect("/login");
    }
    if (personsResult.status === 403) {
      return (
        <>
          <Nav />
          <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
            Du hast keine Berechtigung, die Personenverwaltung zu sehen.
          </main>
        </>
      );
    }
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Die Personen konnten nicht geladen werden.
        </main>
      </>
    );
  }

  const { items: persons, canCreate } = personsResult.data;

  // Role/account/relationship management is TENANT_ADMIN-only — `canCreate`
  // on the person list is derived from exactly that same check (see
  // apps/api/src/persons/persons.service.ts), so it doubles as "may the
  // viewer manage these" without a dedicated API call.
  let departments: AddRoleFormDepartment[] = [];
  let teams: AddRoleFormTeam[] = [];
  let personsWithDetails: PersonManagementPerson[] = persons;

  if (canCreate) {
    const [departmentsResult, teamsResult, ...detailResults] = await Promise.all([
      apiFetch<DepartmentListResponse>("/api/v1/departments", tenantId),
      apiFetch<AddRoleFormTeam[]>("/api/v1/teams", tenantId),
      ...persons.flatMap((p) => [
        apiFetch<PersonManagementRole[]>(`/api/v1/persons/${p.id}/roles`, tenantId),
        apiFetch<PersonManagementInvitation[]>(`/api/v1/persons/${p.id}/invitations`, tenantId),
        apiFetch<PersonManagementRelationship[]>(`/api/v1/persons/${p.id}/relationships`, tenantId),
      ]),
    ]);
    departments = departmentsResult.ok ? departmentsResult.data.items : [];
    teams = teamsResult.ok ? teamsResult.data : [];

    const rolesByPersonId = new Map<string, PersonManagementRole[]>();
    const invitationsByPersonId = new Map<string, PersonManagementInvitation[]>();
    const relationshipsByPersonId = new Map<string, PersonManagementRelationship[]>();
    persons.forEach((p, index) => {
      const rolesResult = detailResults[index * 3];
      const invitationsResult = detailResults[index * 3 + 1];
      const relationshipsResult = detailResults[index * 3 + 2];
      rolesByPersonId.set(p.id, rolesResult?.ok ? (rolesResult.data as PersonManagementRole[]) : []);
      invitationsByPersonId.set(
        p.id,
        invitationsResult?.ok ? (invitationsResult.data as PersonManagementInvitation[]) : [],
      );
      relationshipsByPersonId.set(
        p.id,
        relationshipsResult?.ok ? (relationshipsResult.data as PersonManagementRelationship[]) : [],
      );
    });

    // Simple tenant-wide count of TENANT_ADMIN/TENANT assignments — used
    // to flag the last one as protected in the UI (Phase 5, section 22).
    const allTenantAdminRoles = [...rolesByPersonId.values()]
      .flat()
      .filter((r) => r.role === "TENANT_ADMIN" && !r.departmentName && !r.teamName);
    const isLastTenantAdmin = allTenantAdminRoles.length <= 1;

    personsWithDetails = persons.map((p) => ({
      ...p,
      roles: (rolesByPersonId.get(p.id) ?? []).map((r) =>
        r.role === "TENANT_ADMIN" && !r.departmentName && !r.teamName
          ? { ...r, isLastTenantAdmin }
          : r,
      ),
      invitations: invitationsByPersonId.get(p.id) ?? [],
      relationships: relationshipsByPersonId.get(p.id) ?? [],
    }));
  }

  return (
    <>
      <Nav />
      <PersonManagement
        persons={personsWithDetails}
        canCreate={canCreate}
        departments={departments}
        teams={teams}
      />
    </>
  );
}
