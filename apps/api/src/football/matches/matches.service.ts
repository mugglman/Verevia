import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, MatchHomeAway, MatchStatus, MatchType } from "@verevia/database";
import { AuthorizationService } from "../../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../../authorization/person-role-assignments.service";
import { CreateMatchDto } from "./dto/create-match.dto";
import { ListMatchesQueryDto } from "./dto/list-matches-query.dto";
import { UpdateMatchDto } from "./dto/update-match.dto";

/**
 * A FootballMatch is either a club match or a tournament match (see ADR
 * 0008) — never both, never neither. The DTO carries both sets of fields
 * as nullable so callers don't need to branch on a discriminant to read
 * common fields (venue, startsAt, status, ...).
 */
export interface MatchDto {
  id: string;
  // Club match mode (null for tournament matches).
  teamSeasonId: string | null;
  teamId: string | null;
  teamName: string | null;
  seasonId: string | null;
  opponentName: string | null;
  // Tournament match mode (null for club matches).
  tournamentId: string | null;
  tournamentName: string | null;
  tournamentGroupId: string | null;
  tournamentGroupName: string | null;
  homeParticipantId: string | null;
  homeParticipantName: string | null;
  awayParticipantId: string | null;
  awayParticipantName: string | null;
  // Shared.
  venueId: string | null;
  venueName: string | null;
  startsAt: string;
  type: MatchType;
  status: MatchStatus;
  homeAway: MatchHomeAway;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
  canEdit: boolean;
}

const PARTICIPANT_SELECT = {
  select: {
    id: true,
    externalName: true,
    teamSeason: { select: { team: { select: { name: true } } } },
  },
} as const;

const MATCH_INCLUDE = {
  teamSeason: {
    select: {
      seasonId: true,
      team: { select: { id: true, name: true, departmentId: true } },
    },
  },
  venue: { select: { name: true } },
  tournament: { select: { id: true, name: true, departmentId: true } },
  tournamentGroup: { select: { name: true } },
  homeParticipant: PARTICIPANT_SELECT,
  awayParticipant: PARTICIPANT_SELECT,
} as const;

type ParticipantRef = {
  id: string;
  externalName: string | null;
  teamSeason: { team: { name: string } } | null;
} | null;

type MatchWithRelations = {
  id: string;
  teamSeasonId: string | null;
  venueId: string | null;
  startsAt: Date;
  type: MatchType;
  status: MatchStatus;
  homeAway: MatchHomeAway;
  opponentName: string | null;
  tournamentId: string | null;
  tournamentGroupId: string | null;
  homeParticipantId: string | null;
  awayParticipantId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
  teamSeason: { seasonId: string; team: { id: string; name: string; departmentId: string } } | null;
  venue: { name: string } | null;
  tournament: { id: string; name: string; departmentId: string } | null;
  tournamentGroup: { name: string } | null;
  homeParticipant: ParticipantRef;
  awayParticipant: ParticipantRef;
};

function participantName(participant: ParticipantRef): string | null {
  if (!participant) {
    return null;
  }
  return participant.externalName ?? participant.teamSeason?.team.name ?? null;
}

@Injectable()
export class MatchesService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly roleAssignments: PersonRoleAssignmentsService,
  ) {}

  private requireContext() {
    const context = getTenantContext();
    if (!context?.personId) {
      throw new UnauthorizedException("No active tenant context");
    }
    return context;
  }

  private toDto(match: MatchWithRelations, canEdit: boolean): MatchDto {
    return {
      id: match.id,
      teamSeasonId: match.teamSeasonId,
      teamId: match.teamSeason?.team.id ?? null,
      teamName: match.teamSeason?.team.name ?? null,
      seasonId: match.teamSeason?.seasonId ?? null,
      opponentName: match.opponentName,
      tournamentId: match.tournamentId,
      tournamentName: match.tournament?.name ?? null,
      tournamentGroupId: match.tournamentGroupId,
      tournamentGroupName: match.tournamentGroup?.name ?? null,
      homeParticipantId: match.homeParticipantId,
      homeParticipantName: participantName(match.homeParticipant),
      awayParticipantId: match.awayParticipantId,
      awayParticipantName: participantName(match.awayParticipant),
      venueId: match.venueId,
      venueName: match.venue?.name ?? null,
      startsAt: match.startsAt.toISOString(),
      type: match.type,
      status: match.status,
      homeAway: match.homeAway,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      notes: match.notes,
      canEdit,
    };
  }

  /** A result may only carry a score when it is COMPLETED (mirrors the DB CHECK constraint). */
  private assertValidScoreStatus(status: MatchStatus, homeScore?: number | null, awayScore?: number | null) {
    const hasScore = homeScore != null || awayScore != null;
    if (hasScore && status !== "COMPLETED") {
      throw new BadRequestException("A result can only be set when the match status is COMPLETED");
    }
  }

  /** Club matches are authorized via canOnMatch (team-scoped); tournament matches via canOnSeason (department-scoped) — see ADR 0008. */
  private canAccess(
    assignments: Awaited<ReturnType<PersonRoleAssignmentsService["load"]>>,
    match: Pick<MatchWithRelations, "tournamentId" | "tournament" | "teamSeason">,
    action: "read" | "create" | "update",
  ): boolean {
    if (match.tournamentId) {
      return this.authz.canOnSeason(assignments, action, match.tournament!.departmentId);
    }
    return this.authz.canOnMatch(assignments, action, {
      teamId: match.teamSeason!.team.id,
      departmentId: match.teamSeason!.team.departmentId,
    });
  }

  async list(query: ListMatchesQueryDto): Promise<MatchDto[]> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const matches = await db.footballMatch.findMany({
      where: {
        teamSeasonId: query.teamSeasonId,
        status: query.status,
        type: query.type,
        tournamentId: query.tournamentId,
        tournamentGroupId: query.tournamentGroupId,
        teamSeason: query.seasonId ? { seasonId: query.seasonId } : undefined,
        startsAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
      },
      include: MATCH_INCLUDE,
      orderBy: { startsAt: "asc" },
    });
    return matches
      .filter((m) => this.canAccess(assignments, m, "read"))
      .map((m) => this.toDto(m, this.canAccess(assignments, m, "update")));
  }

  async getById(id: string): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const match = await db.footballMatch.findUnique({ where: { id }, include: MATCH_INCLUDE });
    if (!match) {
      throw new NotFoundException("Match not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.canAccess(assignments, match, "read")) {
      throw new ForbiddenException("Not permitted to read this match");
    }
    return this.toDto(match, this.canAccess(assignments, match, "update"));
  }

  async create(dto: CreateMatchDto): Promise<MatchDto> {
    if (dto.tournamentId) {
      return this.createTournamentMatch(dto);
    }
    return this.createClubMatch(dto);
  }

  private async createClubMatch(dto: CreateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);

    if (!dto.teamSeasonId || !dto.opponentName) {
      throw new BadRequestException("Club matches require teamSeasonId and opponentName");
    }

    const teamSeason = await db.teamSeason.findUnique({
      where: { id: dto.teamSeasonId },
      include: { team: { select: { id: true, departmentId: true } } },
    });
    if (!teamSeason) {
      throw new NotFoundException("Team season not found");
    }

    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnMatch(assignments, "create", {
        teamId: teamSeason.team.id,
        departmentId: teamSeason.team.departmentId,
      })
    ) {
      throw new ForbiddenException("Not permitted to create a match for this team");
    }

    if (dto.venueId) {
      const venue = await db.venue.findUnique({ where: { id: dto.venueId } });
      if (!venue) {
        throw new NotFoundException("Venue not found");
      }
    }

    const status = dto.status ?? "SCHEDULED";
    this.assertValidScoreStatus(status, dto.homeScore, dto.awayScore);

    const match = await db.footballMatch.create({
      data: {
        tenantId: context.tenantId,
        teamSeasonId: dto.teamSeasonId,
        venueId: dto.venueId,
        startsAt: new Date(dto.startsAt),
        type: dto.type,
        status,
        homeAway: dto.homeAway,
        opponentName: dto.opponentName,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        notes: dto.notes,
      },
      include: MATCH_INCLUDE,
    });
    return this.toDto(match, true);
  }

  private async createTournamentMatch(dto: CreateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);

    const tournament = await db.footballTournament.findUnique({ where: { id: dto.tournamentId! } });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }

    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "create", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to create matches for this tournament");
    }

    if (!dto.homeParticipantId || !dto.awayParticipantId) {
      throw new BadRequestException("Tournament matches require homeParticipantId and awayParticipantId");
    }
    if (dto.homeParticipantId === dto.awayParticipantId) {
      throw new BadRequestException("homeParticipantId and awayParticipantId must be different");
    }

    const [homeParticipant, awayParticipant] = await Promise.all([
      db.tournamentParticipant.findUnique({ where: { id: dto.homeParticipantId } }),
      db.tournamentParticipant.findUnique({ where: { id: dto.awayParticipantId } }),
    ]);
    if (!homeParticipant || homeParticipant.tournamentId !== dto.tournamentId) {
      throw new NotFoundException("Home participant not found in this tournament");
    }
    if (!awayParticipant || awayParticipant.tournamentId !== dto.tournamentId) {
      throw new NotFoundException("Away participant not found in this tournament");
    }

    if (dto.tournamentGroupId) {
      const group = await db.tournamentGroup.findUnique({ where: { id: dto.tournamentGroupId } });
      if (!group || group.tournamentId !== dto.tournamentId) {
        throw new NotFoundException("Tournament group not found in this tournament");
      }
    }

    if (dto.venueId) {
      // Application-layer guardrail (ADR 0008): a tournament match may only
      // use a venue that has actually been assigned to the tournament.
      const tournamentVenue = await db.tournamentVenue.findFirst({
        where: { tournamentId: dto.tournamentId, venueId: dto.venueId },
      });
      if (!tournamentVenue) {
        throw new BadRequestException("This venue is not assigned to this tournament");
      }
    }

    const status = dto.status ?? "SCHEDULED";
    this.assertValidScoreStatus(status, dto.homeScore, dto.awayScore);

    const match = await db.footballMatch.create({
      data: {
        tenantId: context.tenantId,
        tournamentId: dto.tournamentId,
        tournamentGroupId: dto.tournamentGroupId,
        homeParticipantId: dto.homeParticipantId,
        awayParticipantId: dto.awayParticipantId,
        venueId: dto.venueId,
        startsAt: new Date(dto.startsAt),
        // Forced regardless of dto.type — a match with a tournamentId is
        // always TOURNAMENT (DB CHECK football_match_tournament_requires_type).
        type: "TOURNAMENT",
        status,
        homeAway: dto.homeAway,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        notes: dto.notes,
      },
      include: MATCH_INCLUDE,
    });
    return this.toDto(match, true);
  }

  async update(id: string, dto: UpdateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.footballMatch.findUnique({ where: { id }, include: MATCH_INCLUDE });
    if (!existing) {
      throw new NotFoundException("Match not found");
    }

    if (existing.tournamentId) {
      return this.updateTournamentMatch(existing, dto);
    }
    return this.updateClubMatch(existing, dto);
  }

  private async updateClubMatch(existing: MatchWithRelations, dto: UpdateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnMatch(assignments, "update", {
        teamId: existing.teamSeason!.team.id,
        departmentId: existing.teamSeason!.team.departmentId,
      })
    ) {
      throw new ForbiddenException("Not permitted to update this match");
    }

    if (dto.venueId) {
      const venue = await db.venue.findUnique({ where: { id: dto.venueId } });
      if (!venue) {
        throw new NotFoundException("Venue not found");
      }
    }

    const finalStatus = dto.status ?? existing.status;
    const finalHomeScore = dto.homeScore !== undefined ? dto.homeScore : existing.homeScore;
    const finalAwayScore = dto.awayScore !== undefined ? dto.awayScore : existing.awayScore;
    this.assertValidScoreStatus(finalStatus, finalHomeScore, finalAwayScore);

    const match = await db.footballMatch.update({
      where: { id: existing.id },
      data: {
        venueId: dto.venueId,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        type: dto.type,
        status: dto.status,
        homeAway: dto.homeAway,
        opponentName: dto.opponentName,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        notes: dto.notes,
      },
      include: MATCH_INCLUDE,
    });
    return this.toDto(match, true);
  }

  private async updateTournamentMatch(existing: MatchWithRelations, dto: UpdateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", existing.tournament!.departmentId)) {
      throw new ForbiddenException("Not permitted to update this tournament match");
    }

    if (dto.venueId) {
      const tournamentVenue = await db.tournamentVenue.findFirst({
        where: { tournamentId: existing.tournamentId!, venueId: dto.venueId },
      });
      if (!tournamentVenue) {
        throw new BadRequestException("This venue is not assigned to this tournament");
      }
    }

    if (dto.tournamentGroupId) {
      const group = await db.tournamentGroup.findUnique({ where: { id: dto.tournamentGroupId } });
      if (!group || group.tournamentId !== existing.tournamentId) {
        throw new NotFoundException("Tournament group not found in this tournament");
      }
    }

    const finalStatus = dto.status ?? existing.status;
    const finalHomeScore = dto.homeScore !== undefined ? dto.homeScore : existing.homeScore;
    const finalAwayScore = dto.awayScore !== undefined ? dto.awayScore : existing.awayScore;
    this.assertValidScoreStatus(finalStatus, finalHomeScore, finalAwayScore);

    const match = await db.footballMatch.update({
      where: { id: existing.id },
      data: {
        venueId: dto.venueId,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        // type is never changed here — a tournament match stays TOURNAMENT.
        status: dto.status,
        homeAway: dto.homeAway,
        tournamentGroupId: dto.tournamentGroupId,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        notes: dto.notes,
      },
      include: MATCH_INCLUDE,
    });
    return this.toDto(match, true);
  }
}
