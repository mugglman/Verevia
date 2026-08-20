import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import {
  TeamView,
  type TeamViewCandidatePerson,
  type TeamViewMember,
  type TeamViewTeam,
} from "@/components/team-view";

export const dynamic = "force-dynamic";

interface DepartmentDetailDto {
  id: string;
  name: string;
}

interface TeamMemberListResponse {
  items: TeamViewMember[];
  canManage: boolean;
}

interface PersonListItem {
  id: string;
  firstName: string;
  lastName: string;
}

interface PersonListResponse {
  items: PersonListItem[];
  canCreate: boolean;
}

export default async function MannschaftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const teamResult = await apiFetch<TeamViewTeam>(`/api/v1/teams/${id}`, tenantId);
  if (!teamResult.ok) {
    if (teamResult.status === 401) {
      redirect("/login");
    }
    if (teamResult.status === 404) {
      notFound();
    }
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Du hast keine Berechtigung, diese Mannschaft zu sehen.
        </main>
      </>
    );
  }
  const team = teamResult.data;

  const departmentResult = await apiFetch<DepartmentDetailDto>(
    `/api/v1/departments/${team.departmentId}`,
    tenantId,
  );
  const departmentName = departmentResult.ok ? departmentResult.data.name : null;

  const membersResult = await apiFetch<TeamMemberListResponse>(
    `/api/v1/teams/${id}/members`,
    tenantId,
  );
  const members = membersResult.ok ? membersResult.data.items : [];
  const canManageMembers = membersResult.ok ? membersResult.data.canManage : false;

  let candidatePersons: TeamViewCandidatePerson[] | undefined;
  if (canManageMembers) {
    const personsResult = await apiFetch<PersonListResponse>("/api/v1/persons", tenantId);
    const memberIds = new Set(members.map((m) => m.personId));
    candidatePersons = personsResult.ok
      ? personsResult.data.items.filter((p) => !memberIds.has(p.id))
      : [];
  }

  return (
    <>
      <Nav />
      <TeamView
        team={team}
        departmentName={departmentName}
        members={members}
        canManageMembers={canManageMembers}
        candidatePersons={candidatePersons}
      />
    </>
  );
}
