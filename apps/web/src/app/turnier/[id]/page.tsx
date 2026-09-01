import { notFound } from "next/navigation";
import { PublicTournamentView } from "@/components/public-tournament-view";
import { apiFetch } from "@/lib/api";
import { resolvePilotTenantId } from "@/lib/tenant";
import type { GroupStandingsTableRow } from "@/components/group-standings-table";
import type { TournamentOverviewMode, TournamentOverviewStatus } from "@/components/tournaments-overview";

export const dynamic = "force-dynamic";

interface PublicTournamentResponse {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  status: TournamentOverviewStatus;
  mode: TournamentOverviewMode;
  departmentName: string | null;
  participants: Array<{ id: string; label: string; groupId: string | null; groupName: string | null; status: "ACTIVE" | "WITHDRAWN" }>;
  groups: Array<{ id: string; name: string; displayOrder: number; standings: GroupStandingsTableRow[]; isComplete: boolean }>;
  matches: Array<{
    id: string;
    startsAt: string;
    status: "SCHEDULED" | "POSTPONED" | "CANCELLED" | "COMPLETED";
    homeLabel: string | null;
    awayLabel: string | null;
    homeScore: number | null;
    awayScore: number | null;
    groupName: string | null;
    venueName: string | null;
  }>;
}

/**
 * Public, unauthenticated tournament page (Phase 17 — Roadmap.md "Phase 4
 * – Turnierplan": öffentliche Turnierseite; MVP-Scope.md item 17). No
 * login required to view, same reasoning/pattern as
 * apps/web/src/app/einladung/[token]/page.tsx: this page resolves the
 * pilot tenant itself (the same helper every page already uses) and calls
 * the new public API endpoint, which needs no session.
 */
export default async function OeffentlicheTurnierseite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await resolvePilotTenantId();
  if (!tenantId) {
    notFound();
  }

  const result = await apiFetch<PublicTournamentResponse>(`/api/v1/public/tournaments/${id}`, tenantId);
  if (!result.ok) {
    notFound();
  }

  const tournament = result.data;
  return (
    <PublicTournamentView
      tournament={{
        id: tournament.id,
        name: tournament.name,
        description: tournament.description,
        startsAt: tournament.startsAt,
        endsAt: tournament.endsAt,
        status: tournament.status,
        mode: tournament.mode,
        departmentName: tournament.departmentName,
      }}
      participants={tournament.participants}
      groups={tournament.groups}
      matches={tournament.matches}
    />
  );
}
