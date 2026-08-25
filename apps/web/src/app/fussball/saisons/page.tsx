import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { SeasonManagement, type SeasonManagementSeason } from "@/components/season-management";

export const dynamic = "force-dynamic";

interface DepartmentListItem {
  id: string;
  name: string;
  sportType: string;
  canEdit: boolean;
}

interface DepartmentListResponse {
  items: DepartmentListItem[];
  canCreate: boolean;
}

export default async function SaisonsPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-neutral-500">
        Kein Verein eingerichtet. (Development-Seed fehlt.)
      </main>
    );
  }

  const departmentsResult = await apiFetch<DepartmentListResponse>("/api/v1/departments", tenantId);
  if (!departmentsResult.ok) {
    if (departmentsResult.status === 401) redirect("/login");
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Die Saisons konnten nicht geladen werden.
        </main>
      </>
    );
  }

  const footballDepartment = departmentsResult.data.items.find((d) => d.sportType === "FOOTBALL");
  if (!footballDepartment) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-500">
          Noch keine Fußballabteilung eingerichtet.
        </main>
      </>
    );
  }

  const seasonsResult = await apiFetch<SeasonManagementSeason[]>(
    `/api/v1/seasons?departmentId=${footballDepartment.id}`,
    tenantId,
  );
  const seasons = seasonsResult.ok ? seasonsResult.data : [];

  return (
    <>
      <Nav />
      <SeasonManagement
        departmentId={footballDepartment.id}
        departmentName={footballDepartment.name}
        canCreate={footballDepartment.canEdit}
        seasons={seasons}
      />
    </>
  );
}
