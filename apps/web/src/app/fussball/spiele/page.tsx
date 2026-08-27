import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { MatchesOverview, type MatchOverviewItem } from "@/components/matches-overview";

export const dynamic = "force-dynamic";

interface DepartmentListItem {
  id: string;
  name: string;
  sportType: string;
}

interface DepartmentListResponse {
  items: DepartmentListItem[];
}

interface SeasonListItem {
  id: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
}

interface TeamSeasonListItem {
  canCreateMatches: boolean;
}

export default async function SpielePage() {
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
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Die Spiele konnten nicht geladen werden.</main>
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

  const seasonsResult = await apiFetch<SeasonListItem[]>(
    `/api/v1/seasons?departmentId=${footballDepartment.id}`,
    tenantId,
  );
  const activeSeason = seasonsResult.ok ? seasonsResult.data.find((s) => s.status === "ACTIVE") : undefined;

  let matches: MatchOverviewItem[] = [];
  let canCreate = false;
  if (activeSeason) {
    const [matchesResult, teamSeasonsResult] = await Promise.all([
      apiFetch<MatchOverviewItem[]>(`/api/v1/football/matches?seasonId=${activeSeason.id}`, tenantId),
      apiFetch<TeamSeasonListItem[]>(`/api/v1/football/team-seasons?seasonId=${activeSeason.id}`, tenantId),
    ]);
    matches = matchesResult.ok ? matchesResult.data : [];
    canCreate = teamSeasonsResult.ok ? teamSeasonsResult.data.some((ts) => ts.canCreateMatches) : false;
  }

  return (
    <>
      <Nav />
      <MatchesOverview departmentName={footballDepartment.name} matches={matches} canCreate={canCreate} />
    </>
  );
}
