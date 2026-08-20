import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { TeamView, type TeamViewTeam } from "@/components/team-view";

export const dynamic = "force-dynamic";

interface DepartmentDetailDto {
  id: string;
  name: string;
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

  return (
    <>
      <Nav />
      <TeamView team={team} departmentName={departmentName} />
    </>
  );
}
