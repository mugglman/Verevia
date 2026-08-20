import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import {
  DepartmentView,
  type DepartmentViewDepartment,
  type DepartmentViewTeam,
} from "@/components/department-view";

export const dynamic = "force-dynamic";

export default async function AbteilungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const departmentResult = await apiFetch<DepartmentViewDepartment>(
    `/api/v1/departments/${id}`,
    tenantId,
  );
  if (!departmentResult.ok) {
    if (departmentResult.status === 401) {
      redirect("/login");
    }
    if (departmentResult.status === 404) {
      notFound();
    }
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Du hast keine Berechtigung, diese Abteilung zu sehen.
        </main>
      </>
    );
  }

  const teamsResult = await apiFetch<DepartmentViewTeam[]>(
    `/api/v1/teams?departmentId=${id}`,
    tenantId,
  );
  const teams = teamsResult.ok ? teamsResult.data : [];

  return (
    <>
      <Nav />
      <DepartmentView department={departmentResult.data} teams={teams} />
    </>
  );
}
