import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { MatchCreateForm, type MatchCreateFormTeamSeason, type MatchCreateFormVenue } from "@/components/match-create-form";

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
  id: string;
  teamName: string;
  ageGroupName: string;
  canCreateMatches: boolean;
}

interface VenueListItem {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

interface VenueListResponse {
  items: VenueListItem[];
}

export default async function NeuesSpielPage() {
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

  const seasonsResult = await apiFetch<SeasonListItem[]>(
    `/api/v1/seasons?departmentId=${footballDepartment.id}`,
    tenantId,
  );
  const activeSeason = seasonsResult.ok ? seasonsResult.data.find((s) => s.status === "ACTIVE") : undefined;

  let teamSeasons: MatchCreateFormTeamSeason[] = [];
  if (activeSeason) {
    const teamSeasonsResult = await apiFetch<TeamSeasonListItem[]>(
      `/api/v1/football/team-seasons?seasonId=${activeSeason.id}`,
      tenantId,
    );
    teamSeasons = teamSeasonsResult.ok
      ? teamSeasonsResult.data
          .filter((ts) => ts.canCreateMatches)
          .map((ts) => ({ id: ts.id, teamName: ts.teamName, ageGroupName: ts.ageGroupName }))
      : [];
  }

  const venuesResult = await apiFetch<VenueListResponse>("/api/v1/venues?status=ACTIVE", tenantId);
  const venues: MatchCreateFormVenue[] = venuesResult.ok
    ? venuesResult.data.items.map((v) => ({ id: v.id, name: v.name }))
    : [];

  return (
    <>
      <Nav />
      <MatchCreateForm teamSeasons={teamSeasons} venues={venues} />
    </>
  );
}
