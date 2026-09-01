import { NotFoundException } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { getTenantPrisma, ParticipantStatus, TournamentMode, TournamentStatus } from "@verevia/database";
import { participantName, pendingSlotLabel, type ParticipantRef, type PendingSlotRef } from "../../matches/matches.service";
import { computeGroupStandings, type GroupMatchResult, type GroupStandingsRow } from "../schedule/generator/group-standings";

/**
 * Phase 17 — read-only projection for the public, unauthenticated
 * tournament page (Roadmap.md "Phase 4 – Turnierplan": öffentliche
 * Turnierseite; MVP-Scope.md item 17: öffentliche Turnierinformationen).
 * Deliberately a SEPARATE, smaller DTO from the authenticated
 * `TournamentDto`/`ParticipantDto`/`MatchDto`/`TournamentGroupDto` family
 * — no `canEdit`, no management affordances, no `resultLocked` (nothing
 * here is ever actionable by a public visitor) — mirrors how
 * `PublicInvitationDto` is already a separate, smaller shape from the
 * authenticated invitation view (see invitations.service.ts).
 *
 * Standings computation (`computeGroupStandings`) and match-side label
 * resolution (`participantName`/`pendingSlotLabel`) are reused verbatim
 * from the existing, exhaustively-tested modules — no second standings or
 * slot-label engine.
 */
export interface PublicParticipantDto {
  id: string;
  label: string;
  groupId: string | null;
  groupName: string | null;
  status: ParticipantStatus;
}

export interface PublicGroupDto {
  id: string;
  name: string;
  displayOrder: number;
  standings: GroupStandingsRow[];
  isComplete: boolean;
}

export interface PublicMatchDto {
  id: string;
  startsAt: string;
  status: string;
  homeLabel: string | null;
  awayLabel: string | null;
  homeScore: number | null;
  awayScore: number | null;
  groupName: string | null;
  venueName: string | null;
}

export interface PublicTournamentDto {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  status: TournamentStatus;
  mode: TournamentMode | null;
  departmentName: string | null;
  participants: PublicParticipantDto[];
  groups: PublicGroupDto[];
  matches: PublicMatchDto[];
}

const PARTICIPANT_SELECT = {
  select: {
    id: true,
    externalName: true,
    teamSeason: { select: { team: { select: { name: true } } } },
  },
} as const;

const SLOT_SELECT = {
  select: {
    side: true,
    sourceType: true,
    groupId: true,
    groupPosition: true,
    group: { select: { name: true } },
  },
} as const;

function participantLabel(participant: {
  externalName: string | null;
  teamSeason: { team: { name: string } } | null;
}): string {
  return participant.externalName ?? participant.teamSeason?.team.name ?? "";
}

@Injectable()
export class PublicTournamentService {
  /**
   * `tenantId` is resolved by the caller (apps/web already resolves the
   * pilot tenant from its own env-configured slug for every page, see
   * apps/web/src/lib/tenant.ts) and forwarded as the `X-Tenant-Id` header
   * — the SAME mechanism every other endpoint uses. This endpoint just
   * skips the session/Membership check that `TenantContextInterceptor`
   * would otherwise require, since there is no logged-in visitor. RLS
   * still fully applies: `getTenantPrisma(tenantId)` sets `app.tenant_id`
   * for every query below, so a mismatched (tenantId, tournamentId) pair
   * simply 404s, exactly like an unresolvable invitation token does.
   */
  async getPublicView(tenantId: string, tournamentId: string): Promise<PublicTournamentDto> {
    const db = getTenantPrisma(tenantId);

    const tournament = await db.footballTournament.findUnique({ where: { id: tournamentId } });
    // DRAFT tournaments are a work-in-progress internal state (not yet
    // announced) — deliberately not publicly visible. Every other status
    // (PLANNED/ACTIVE/COMPLETED/CANCELLED) is public, so visitors can also
    // see that a tournament was cancelled rather than getting a 404.
    if (!tournament || tournament.status === "DRAFT") {
      throw new NotFoundException("Tournament not found");
    }

    const department = await db.department.findUnique({ where: { id: tournament.departmentId }, select: { name: true } });

    const [participants, groups, matches] = await Promise.all([
      db.tournamentParticipant.findMany({
        where: { tournamentId },
        include: { teamSeason: { select: { team: { select: { name: true } } } }, group: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.tournamentGroup.findMany({ where: { tournamentId }, orderBy: { displayOrder: "asc" } }),
      db.footballMatch.findMany({
        where: { tournamentId },
        include: {
          venue: { select: { name: true } },
          tournamentGroup: { select: { name: true } },
          homeParticipant: PARTICIPANT_SELECT,
          awayParticipant: PARTICIPANT_SELECT,
          slotsAsOwner: SLOT_SELECT,
        },
        orderBy: { startsAt: "asc" },
      }),
    ]);

    // Standings: same live-derived approach as TournamentGroupsService.list()
    // (ADR 0012) — computed here from the SAME participants/matches this
    // request already loaded, no extra queries, no persisted standings.
    const groupParticipants = participants.filter((p) => p.status === "ACTIVE" && p.groupId);
    const groupMatches = matches.filter((m) => m.tournamentGroupId);

    const groupDtos: PublicGroupDto[] = groups.map((g) => {
      const participantIds = groupParticipants.filter((p) => p.groupId === g.id).map((p) => p.id);
      const matchesForGroup = groupMatches.filter((m) => m.tournamentGroupId === g.id);
      const isComplete = matchesForGroup.length > 0 && matchesForGroup.every((m) => m.status === "COMPLETED");
      const completedResults: GroupMatchResult[] = matchesForGroup
        .filter((m) => m.status === "COMPLETED" && m.homeParticipantId && m.awayParticipantId && m.homeScore != null && m.awayScore != null)
        .map((m) => ({
          homeParticipantId: m.homeParticipantId!,
          awayParticipantId: m.awayParticipantId!,
          homeScore: m.homeScore!,
          awayScore: m.awayScore!,
        }));
      return {
        id: g.id,
        name: g.name,
        displayOrder: g.displayOrder,
        standings: computeGroupStandings(participantIds, completedResults),
        isComplete,
      };
    });

    return {
      id: tournament.id,
      name: tournament.name,
      description: tournament.description,
      startsAt: tournament.startsAt.toISOString(),
      endsAt: tournament.endsAt?.toISOString() ?? null,
      status: tournament.status,
      mode: tournament.mode,
      departmentName: department?.name ?? null,
      participants: participants.map((p) => ({
        id: p.id,
        label: participantLabel(p),
        groupId: p.groupId,
        groupName: p.group?.name ?? null,
        status: p.status,
      })),
      groups: groupDtos,
      matches: matches.map((m) => ({
        id: m.id,
        startsAt: m.startsAt.toISOString(),
        status: m.status,
        homeLabel: participantName(m.homeParticipant as ParticipantRef) ?? pendingSlotLabel(m.slotsAsOwner as PendingSlotRef[], "HOME"),
        awayLabel: participantName(m.awayParticipant as ParticipantRef) ?? pendingSlotLabel(m.slotsAsOwner as PendingSlotRef[], "AWAY"),
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        groupName: m.tournamentGroup?.name ?? null,
        venueName: m.venue?.name ?? null,
      })),
    };
  }
}
