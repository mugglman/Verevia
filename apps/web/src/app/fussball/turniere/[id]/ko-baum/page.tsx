import { notFound, redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import { Nav } from "@/components/nav";
import {
  TournamentKnockoutGenerator,
  type KnockoutGeneratorGroup,
  type KnockoutGeneratorParticipant,
  type KnockoutGeneratorVenue,
} from "@/components/tournament-knockout-generator";

export const dynamic = "force-dynamic";

interface TournamentResponse {
  id: string;
  name: string;
  canEdit: boolean;
}

interface ParticipantListItem {
  id: string;
  teamName: string | null;
  externalName: string | null;
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

export default async function TurnierKoBaumPage({ params }: { params: Promise<{ id: string }> }) {
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
          Du hast keine Berechtigung, für dieses Turnier einen KO-Baum zu erstellen.
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
          Du hast keine Berechtigung, für dieses Turnier einen KO-Baum zu erstellen.
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

  const participantList = (participantsResult.ok ? participantsResult.data : []).filter((p) => p.status === "ACTIVE");
  const groupList = groupsResult.ok ? groupsResult.data : [];
  const venueList = venuesResult.ok ? venuesResult.data : [];
  const hasExistingSchedule = matchesResult.ok && matchesResult.data.length > 0;

  const participants: KnockoutGeneratorParticipant[] = participantList.map((p) => ({
    id: p.id,
    label: p.teamName ?? p.externalName ?? "Unbenannter Teilnehmer",
  }));

  const groups: KnockoutGeneratorGroup[] = groupList
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((g) => ({ id: g.id, name: g.name }));

  const availableVenues: KnockoutGeneratorVenue[] = venueList.map((v) => ({
    venueId: v.venueId,
    venueName: v.venueName,
    label: v.label,
  }));

  return (
    <>
      <Nav />
      <TournamentKnockoutGenerator
        tournamentId={tournament.id}
        tournamentName={tournament.name}
        hasExistingSchedule={hasExistingSchedule}
        participants={participants}
        groups={groups}
        availableVenues={availableVenues}
      />
    </>
  );
}
