import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, Prisma, TeamSeasonStatus } from "@verevia/database";
import { AuthorizationService } from "../../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../../authorization/person-role-assignments.service";
import { CreateTeamSeasonDto } from "./dto/create-team-season.dto";
import { ListTeamSeasonsQueryDto } from "./dto/list-team-seasons-query.dto";
import { UpdateTeamSeasonDto } from "./dto/update-team-season.dto";

export interface TeamSeasonDto {
  id: string;
  teamId: string;
  teamName: string;
  seasonId: string;
  ageGroupId: string;
  ageGroupName: string;
  displayName: string | null;
  status: TeamSeasonStatus;
  canEdit: boolean;
  /**
   * Phase 10: whether the caller may create a FootballMatch for this team
   * season. Deliberately computed here (not only in MatchesService) —
   * exposed so the web app's match-creation form can offer exactly the
   * team seasons the caller is allowed to schedule a match for, without
   * duplicating `canOnMatch` authorization logic client-side (the web app
   * only ever branches on booleans the API already computed, see
   * apps/web/src/lib/api.ts convention). Distinct from `canEdit` above,
   * which reflects `canOnTeam` (TeamSeason-record management, DEPARTMENT_ADMIN-
   * only) — COACH/TEAM_MANAGER of the team can create matches but cannot
   * edit the TeamSeason record itself.
   */
  canCreateMatches: boolean;
}

@Injectable()
export class TeamSeasonsService {
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

  private toDto(
    teamSeason: {
      id: string;
      teamId: string;
      seasonId: string;
      ageGroupId: string;
      displayName: string | null;
      status: TeamSeasonStatus;
      team: { name: string };
      ageGroup: { name: string };
    },
    canEdit: boolean,
    canCreateMatches: boolean,
  ): TeamSeasonDto {
    return {
      id: teamSeason.id,
      teamId: teamSeason.teamId,
      teamName: teamSeason.team.name,
      seasonId: teamSeason.seasonId,
      ageGroupId: teamSeason.ageGroupId,
      ageGroupName: teamSeason.ageGroup.name,
      displayName: teamSeason.displayName,
      status: teamSeason.status,
      canEdit,
      canCreateMatches,
    };
  }

  async list(query: ListTeamSeasonsQueryDto): Promise<TeamSeasonDto[]> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const teamSeasons = await db.teamSeason.findMany({
      where: {
        seasonId: query.seasonId,
        teamId: query.teamId,
        ageGroupId: query.ageGroupId,
      },
      include: { team: { select: { name: true, departmentId: true } }, ageGroup: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return teamSeasons
      .filter((ts) =>
        this.authz.canOnTeam(assignments, "read", { teamId: ts.teamId, departmentId: ts.team.departmentId }),
      )
      .map((ts) =>
        this.toDto(
          ts,
          this.authz.canOnTeam(assignments, "update", { teamId: ts.teamId, departmentId: ts.team.departmentId }),
          this.authz.canOnMatch(assignments, "create", { teamId: ts.teamId, departmentId: ts.team.departmentId }),
        ),
      );
  }

  async getById(id: string): Promise<TeamSeasonDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const teamSeason = await db.teamSeason.findUnique({
      where: { id },
      include: { team: { select: { name: true, departmentId: true } }, ageGroup: { select: { name: true } } },
    });
    if (!teamSeason) {
      throw new NotFoundException("Team season not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnTeam(assignments, "read", {
        teamId: teamSeason.teamId,
        departmentId: teamSeason.team.departmentId,
      })
    ) {
      throw new ForbiddenException("Not permitted to read this team season");
    }
    return this.toDto(
      teamSeason,
      this.authz.canOnTeam(assignments, "update", {
        teamId: teamSeason.teamId,
        departmentId: teamSeason.team.departmentId,
      }),
      this.authz.canOnMatch(assignments, "create", {
        teamId: teamSeason.teamId,
        departmentId: teamSeason.team.departmentId,
      }),
    );
  }

  async create(dto: CreateTeamSeasonDto): Promise<TeamSeasonDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);

    const team = await db.team.findUnique({ where: { id: dto.teamId } });
    if (!team) {
      throw new NotFoundException("Team not found");
    }

    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnTeam(assignments, "create", { teamId: team.id, departmentId: team.departmentId })) {
      throw new ForbiddenException("Not permitted to create a team season for this team");
    }

    // Application-layer guardrail (Phase 9, section 13): a TeamSeason may
    // only attach to a Team belonging to a FOOTBALL department. Not
    // enforced at the DB level — see the model's schema.prisma comment
    // for why a trigger was judged disproportionate for this phase.
    const department = await db.department.findUnique({ where: { id: team.departmentId } });
    if (!department || department.sportType !== "FOOTBALL") {
      throw new BadRequestException("Team seasons can only be created for teams in a football department");
    }

    const season = await db.season.findUnique({ where: { id: dto.seasonId } });
    if (!season) {
      throw new NotFoundException("Season not found");
    }
    if (season.departmentId !== team.departmentId) {
      throw new BadRequestException("The season must belong to the same department as the team");
    }

    const ageGroup = await db.ageGroup.findUnique({ where: { id: dto.ageGroupId } });
    if (!ageGroup) {
      throw new NotFoundException("Age group not found");
    }

    try {
      const teamSeason = await db.teamSeason.create({
        data: {
          tenantId: context.tenantId,
          teamId: dto.teamId,
          seasonId: dto.seasonId,
          ageGroupId: dto.ageGroupId,
          displayName: dto.displayName,
          status: dto.status ?? "ACTIVE",
        },
        include: { team: { select: { name: true } }, ageGroup: { select: { name: true } } },
      });
      return this.toDto(teamSeason, true, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This team already has a season entry for this season");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTeamSeasonDto): Promise<TeamSeasonDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.teamSeason.findUnique({
      where: { id },
      include: { team: { select: { departmentId: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Team season not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnTeam(assignments, "update", {
        teamId: existing.teamId,
        departmentId: existing.team.departmentId,
      })
    ) {
      throw new ForbiddenException("Not permitted to update this team season");
    }

    if (dto.ageGroupId) {
      const ageGroup = await db.ageGroup.findUnique({ where: { id: dto.ageGroupId } });
      if (!ageGroup) {
        throw new NotFoundException("Age group not found");
      }
    }

    const teamSeason = await db.teamSeason.update({
      where: { id },
      data: { ageGroupId: dto.ageGroupId, displayName: dto.displayName, status: dto.status },
      include: { team: { select: { name: true } }, ageGroup: { select: { name: true } } },
    });
    return this.toDto(teamSeason, true, true);
  }
}
