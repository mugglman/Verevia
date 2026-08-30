import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import {
  TournamentScheduleGenerator,
  type ScheduleGeneratorGroup,
  type ScheduleGeneratorVenue,
} from "@/components/tournament-schedule-generator";

export const dynamic = "force-dynamic";

interface TournamentResponse {
  id: string;
  name: string;
  canEdit: boolean;
}

interface ParticipantListItem {
  id: string;
  groupId: string | null;
  status: "ACTIVE" | "WITHDRAWN";
}

interface GroupListItem {
  id: string;
  name: string;
  displayOrder: number;
}

interface TournamentVenueListItem {
  venueId: string;
  venueName: string;
  label: string | null;
}

interface MatchListItem {
  id: string;
}

export default async function TurnierSpielplanPage({ params }: { params: Promise<{ id: string }> }) {
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
          Du hast keine Berechtigung, für dieses Turnier einen Spielplan zu erstellen.
        </main>
      </>
    );
  }
  const tournament = tournamentResult.data;
  if (!tournament.canEdit) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl p-4 text-sm text-neutral-600">
          Du hast keine Berechtigung, für dieses Turnier einen Spielplan zu erstellen.
        </main>
      </>
    );
  }

  const [participantsResult, groupsResult, venuesResult, matchesResult] = await Promise.all([
    apiFetch<ParticipantListItem[]>(`/api/v1/football/tournaments/${id}/participants`, tenantId),
    apiFetch<GroupListItem[]>(`/api/v1/football/tournaments/${id}/groups`, tenantId),
    apiFetch<TournamentVenueListItem[]>(`/api/v1/football/tournaments/${id}/venues`, tenantId),
    apiFetch<MatchListItem[]>(`/api/v1/football/tournaments/${id}/matches`, tenantId),
  ]);

  const participants = (participantsResult.ok ? participantsResult.data : []).filter((p) => p.status === "ACTIVE");
  const groupList = groupsResult.ok ? groupsResult.data : [];
  const venueList = venuesResult.ok ? venuesResult.data : [];
  const hasExistingSchedule = matchesResult.ok && matchesResult.data.length > 0;

  const groups: ScheduleGeneratorGroup[] = groupList
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((g) => ({
      id: g.id,
      name: g.name,
      participantCount: participants.filter((p) => p.groupId === g.id).length,
    }));

  const availableVenues: ScheduleGeneratorVenue[] = venueList.map((v) => ({
    venueId: v.venueId,
    venueName: v.venueName,
    label: v.label,
  }));

  return (
    <>
      <Nav />
      <TournamentScheduleGenerator
        tournamentId={tournament.id}
        tournamentName={tournament.name}
        hasExistingSchedule={hasExistingSchedule}
        groups={groups}
        availableVenues={availableVenues}
      />
    </>
  );
}
