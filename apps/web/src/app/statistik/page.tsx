import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import { StatisticsTeamSeasonList, type StatisticsTeamSeasonListItem } from "@/components/statistics-team-season-list";

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
}

/**
 * Auswahlseite: Team/Saison → Statistik. Wiederverwendet dieselbe
 * Abteilung/Saison/TeamSeason-Fetch-Kette wie
 * apps/web/src/app/fussball/spiele/neu/page.tsx, statt eine neue zu
 * erfinden. Sichtbarkeit pro TeamSeason wird ausschließlich über die
 * Statistics-API selbst geprüft (Detailseite, canOnMatch) — hier wird
 * bewusst nicht dupliziert vorgefiltert; jede aktive TeamSeason der
 * Saison wird verlinkt, ein Klick auf eine nicht sichtbare liefert dort
 * die reguläre 403-Meldung.
 */
export default async function StatistikPage() {
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
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">Die Statistik konnte nicht geladen werden.</main>
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

  let teamSeasons: StatisticsTeamSeasonListItem[] = [];
  if (activeSeason) {
    const teamSeasonsResult = await apiFetch<TeamSeasonListItem[]>(
      `/api/v1/football/team-seasons?seasonId=${activeSeason.id}`,
      tenantId,
    );
    teamSeasons = teamSeasonsResult.ok
      ? teamSeasonsResult.data.map((ts) => ({ id: ts.id, teamName: ts.teamName, ageGroupName: ts.ageGroupName }))
      : [];
  }

  return (
    <>
      <Nav />
      <StatisticsTeamSeasonList teamSeasons={teamSeasons} />
    </>
  );
}
