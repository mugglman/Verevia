import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import {
  FootballOverview,
  type FootballOverviewSeason,
  type FootballOverviewTeamSeason,
} from "@/components/football-overview";

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

interface SeasonListItem {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
}

export default async function FussballPage() {
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
          Die Fußballabteilung konnte nicht geladen werden.
        </main>
      </>
    );
  }

  const footballDepartment = departmentsResult.data.items.find((d) => d.sportType === "FOOTBALL") ?? null;

  if (!footballDepartment) {
    return (
      <>
        <Nav />
        <FootballOverview department={null} activeSeason={null} teamSeasons={[]} />
      </>
    );
  }

  const seasonsResult = await apiFetch<SeasonListItem[]>(
    `/api/v1/seasons?departmentId=${footballDepartment.id}`,
    tenantId,
  );
  const seasons = seasonsResult.ok ? seasonsResult.data : [];
  const activeSeasonItem = seasons.find((s) => s.status === "ACTIVE") ?? null;
  const activeSeason: FootballOverviewSeason | null = activeSeasonItem
    ? {
        id: activeSeasonItem.id,
        name: activeSeasonItem.name,
        startsAt: activeSeasonItem.startsAt,
        endsAt: activeSeasonItem.endsAt,
      }
    : null;

  let teamSeasons: FootballOverviewTeamSeason[] = [];
  if (activeSeason) {
    const teamSeasonsResult = await apiFetch<FootballOverviewTeamSeason[]>(
      `/api/v1/football/team-seasons?seasonId=${activeSeason.id}`,
      tenantId,
    );
    teamSeasons = teamSeasonsResult.ok ? teamSeasonsResult.data : [];
  }

  return (
    <>
      <Nav />
      <FootballOverview
        department={{ id: footballDepartment.id, name: footballDepartment.name, canManage: footballDepartment.canEdit }}
        activeSeason={activeSeason}
        teamSeasons={teamSeasons}
      />
    </>
  );
}
