import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import {
  TournamentDetail,
  type TournamentDetailAvailableTeamSeason,
  type TournamentDetailAvailableVenue,
  type TournamentDetailGroup,
  type TournamentDetailMatch,
  type TournamentDetailParticipant,
  type TournamentDetailTournament,
  type TournamentDetailVenue,
} from "@/components/tournament-detail";

export const dynamic = "force-dynamic";

interface TournamentResponse extends TournamentDetailTournament {
  seasonId: string | null;
}

interface TeamSeasonListItem {
  id: string;
  teamName: string;
  ageGroupName: string;
}

interface VenueListItem {
  id: string;
  name: string;
}

interface VenueListResponse {
  items: VenueListItem[];
}

export default async function TurnierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const tournamentResult = await apiFetch<TournamentResponse>(`/api/v1/football/tournaments/${id}`, tenantId);
  if (!tournamentResult.ok) {
    if (tournamentResult.status === 401) redirect("/login");
    if (tournamentResult.status === 404) notFound();
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Du hast keine Berechtigung, dieses Turnier zu sehen.
        </main>
      </>
    );
  }
  const tournament = tournamentResult.data;

  const [participantsResult, groupsResult, venuesResult, matchesResult, allVenuesResult] = await Promise.all([
    apiFetch<TournamentDetailParticipant[]>(`/api/v1/football/tournaments/${id}/participants`, tenantId),
    apiFetch<TournamentDetailGroup[]>(`/api/v1/football/tournaments/${id}/groups`, tenantId),
    apiFetch<TournamentDetailVenue[]>(`/api/v1/football/tournaments/${id}/venues`, tenantId),
    apiFetch<TournamentDetailMatch[]>(`/api/v1/football/tournaments/${id}/matches`, tenantId),
    apiFetch<VenueListResponse>("/api/v1/venues?status=ACTIVE", tenantId),
  ]);

  const participants = participantsResult.ok ? participantsResult.data : [];
  const groups = groupsResult.ok ? groupsResult.data : [];
  const venues = venuesResult.ok ? venuesResult.data : [];
  const matches = matchesResult.ok ? matchesResult.data : [];

  const teamSeasonsResult = await apiFetch<TeamSeasonListItem[]>(
    tournament.seasonId
      ? `/api/v1/football/team-seasons?seasonId=${tournament.seasonId}`
      : "/api/v1/football/team-seasons",
    tenantId,
  );
  const usedTeamSeasonIds = new Set(participants.map((p) => p.teamSeasonId).filter((teamSeasonId): teamSeasonId is string => Boolean(teamSeasonId)));
  const availableTeamSeasons: TournamentDetailAvailableTeamSeason[] = teamSeasonsResult.ok
    ? teamSeasonsResult.data
        .filter((ts) => !usedTeamSeasonIds.has(ts.id))
        .map((ts) => ({ id: ts.id, teamName: ts.teamName, ageGroupName: ts.ageGroupName }))
    : [];

  const usedVenueIds = new Set(venues.map((v) => v.venueId));
  const availableVenues: TournamentDetailAvailableVenue[] = allVenuesResult.ok
    ? allVenuesResult.data.items.filter((v) => !usedVenueIds.has(v.id))
    : [];

  return (
    <>
      <Nav />
      <TournamentDetail
        tournament={tournament}
        participants={participants}
        groups={groups}
        venues={venues}
        matches={matches}
        availableTeamSeasons={availableTeamSeasons}
        availableVenues={availableVenues}
      />
    </>
  );
}
