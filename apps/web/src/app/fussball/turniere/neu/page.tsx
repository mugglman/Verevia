import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { TournamentCreateForm, type TournamentCreateFormSeason } from "@/components/tournament-create-form";

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

interface SeasonListItem {
  id: string;
  name: string;
}

export default async function NeuesTurnierPage() {
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const departmentsResult = await apiFetch<DepartmentListResponse>("/api/v1/departments", tenantId);
  if (!departmentsResult.ok) {
    if (departmentsResult.status === 401) redirect("/login");
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Das Formular konnte nicht geladen werden.</main>
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
  if (!footballDepartment.canEdit) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Du hast keine Berechtigung, ein Turnier anzulegen.
        </main>
      </>
    );
  }

  const seasonsResult = await apiFetch<SeasonListItem[]>(
    `/api/v1/seasons?departmentId=${footballDepartment.id}`,
    tenantId,
  );
  const seasons: TournamentCreateFormSeason[] = seasonsResult.ok
    ? seasonsResult.data.map((s) => ({ id: s.id, name: s.name }))
    : [];

  return (
    <>
      <Nav />
      <TournamentCreateForm departmentId={footballDepartment.id} seasons={seasons} />
    </>
  );
}
