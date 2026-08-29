import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { TournamentsOverview, type TournamentOverviewItem } from "@/components/tournaments-overview";

export const dynamic = "force-dynamic";

interface DepartmentListItem {
  id: string;
  name: string;
  sportType: string;
  canEdit: boolean;
}

interface DepartmentListResponse {
  items: DepartmentListItem[];
}

export default async function TurnierePage() {
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
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Die Turniere konnten nicht geladen werden.</main>
      </>
    );
  }

  const footballDepartment = departmentsResult.data.items.find((d) => d.sportType === "FOOTBALL");
  if (!footballDepartment) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-500">Noch keine Fußballabteilung eingerichtet.</main>
      </>
    );
  }

  const tournamentsResult = await apiFetch<TournamentOverviewItem[]>(
    `/api/v1/football/tournaments?departmentId=${footballDepartment.id}`,
    tenantId,
  );
  const tournaments = tournamentsResult.ok ? tournamentsResult.data : [];

  return (
    <>
      <Nav />
      <TournamentsOverview
        departmentName={footballDepartment.name}
        tournaments={tournaments}
        canCreate={footballDepartment.canEdit}
      />
    </>
  );
}
