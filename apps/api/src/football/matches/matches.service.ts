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

export interface MatchDto {
  id: string;
  teamSeasonId: string;
  teamId: string;
  teamName: string;
  seasonId: string;
  venueId: string | null;
  venueName: string | null;
  startsAt: string;
  type: MatchType;
  status: MatchStatus;
  homeAway: MatchHomeAway;
  opponentName: string;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
  canEdit: boolean;
}

const MATCH_INCLUDE = {
  teamSeason: {
    select: {
      seasonId: true,
      team: { select: { id: true, name: true, departmentId: true } },
    },
  },
  venue: { select: { name: true } },
} as const;

type MatchWithRelations = {
  id: string;
  teamSeasonId: string;
  venueId: string | null;
  startsAt: Date;
  type: MatchType;
  status: MatchStatus;
  homeAway: MatchHomeAway;
  opponentName: string;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
  teamSeason: { seasonId: string; team: { id: string; name: string; departmentId: string } };
  venue: { name: string } | null;
};

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
      teamId: match.teamSeason.team.id,
      teamName: match.teamSeason.team.name,
      seasonId: match.teamSeason.seasonId,
      venueId: match.venueId,
      venueName: match.venue?.name ?? null,
      startsAt: match.startsAt.toISOString(),
      type: match.type,
      status: match.status,
      homeAway: match.homeAway,
      opponentName: match.opponentName,
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

  async list(query: ListMatchesQueryDto): Promise<MatchDto[]> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const matches = await db.footballMatch.findMany({
      where: {
        teamSeasonId: query.teamSeasonId,
        status: query.status,
        type: query.type,
        teamSeason: query.seasonId ? { seasonId: query.seasonId } : undefined,
        startsAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
      },
      include: MATCH_INCLUDE,
      orderBy: { startsAt: "asc" },
    });
    return matches
      .filter((m) =>
        this.authz.canOnMatch(assignments, "read", {
          teamId: m.teamSeason.team.id,
          departmentId: m.teamSeason.team.departmentId,
        }),
      )
      .map((m) =>
        this.toDto(
          m,
          this.authz.canOnMatch(assignments, "update", {
            teamId: m.teamSeason.team.id,
            departmentId: m.teamSeason.team.departmentId,
          }),
        ),
      );
  }

  async getById(id: string): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const match = await db.footballMatch.findUnique({ where: { id }, include: MATCH_INCLUDE });
    if (!match) {
      throw new NotFoundException("Match not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const context_ = { teamId: match.teamSeason.team.id, departmentId: match.teamSeason.team.departmentId };
    if (!this.authz.canOnMatch(assignments, "read", context_)) {
      throw new ForbiddenException("Not permitted to read this match");
    }
    return this.toDto(match, this.authz.canOnMatch(assignments, "update", context_));
  }

  async create(dto: CreateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);

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

  async update(id: string, dto: UpdateMatchDto): Promise<MatchDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.footballMatch.findUnique({ where: { id }, include: MATCH_INCLUDE });
    if (!existing) {
      throw new NotFoundException("Match not found");
    }

    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnMatch(assignments, "update", {
        teamId: existing.teamSeason.team.id,
        departmentId: existing.teamSeason.team.departmentId,
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
      where: { id },
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
}
