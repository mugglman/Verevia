import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, TournamentMode, TournamentStatus } from "@verevia/database";
import { AuthorizationService } from "../../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../../authorization/person-role-assignments.service";
import { CreateTournamentDto } from "./dto/create-tournament.dto";
import { ListTournamentsQueryDto } from "./dto/list-tournaments-query.dto";
import { UpdateTournamentDto } from "./dto/update-tournament.dto";

export interface TournamentDto {
  id: string;
  departmentId: string;
  seasonId: string | null;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  status: TournamentStatus;
  mode: TournamentMode | null;
  participantCount: number;
  groupCount: number;
  canEdit: boolean;
}

const TOURNAMENT_INCLUDE = {
  _count: { select: { participants: true, groups: true } },
} as const;

@Injectable()
export class TournamentsService {
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
    tournament: {
      id: string;
      departmentId: string;
      seasonId: string | null;
      name: string;
      description: string | null;
      startsAt: Date;
      endsAt: Date | null;
      status: TournamentStatus;
      mode: TournamentMode | null;
      _count: { participants: number; groups: number };
    },
    canEdit: boolean,
  ): TournamentDto {
    return {
      id: tournament.id,
      departmentId: tournament.departmentId,
      seasonId: tournament.seasonId,
      name: tournament.name,
      description: tournament.description,
      startsAt: tournament.startsAt.toISOString(),
      endsAt: tournament.endsAt?.toISOString() ?? null,
      status: tournament.status,
      mode: tournament.mode,
      participantCount: tournament._count.participants,
      groupCount: tournament._count.groups,
      canEdit,
    };
  }

  private assertValidDateRange(startsAt: string, endsAt?: string) {
    if (endsAt && new Date(endsAt) < new Date(startsAt)) {
      throw new BadRequestException("endsAt must not be before startsAt");
    }
  }

  async list(query: ListTournamentsQueryDto): Promise<TournamentDto[]> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const tournaments = await db.footballTournament.findMany({
      where: {
        departmentId: query.departmentId,
        seasonId: query.seasonId,
        status: query.status,
      },
      include: TOURNAMENT_INCLUDE,
      orderBy: { startsAt: "desc" },
    });
    return tournaments
      .filter((t) => this.authz.canOnSeason(assignments, "read", t.departmentId))
      .map((t) => this.toDto(t, this.authz.canOnSeason(assignments, "update", t.departmentId)));
  }

  async getById(id: string): Promise<TournamentDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const tournament = await db.footballTournament.findUnique({ where: { id }, include: TOURNAMENT_INCLUDE });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "read", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to read this tournament");
    }
    return this.toDto(tournament, this.authz.canOnSeason(assignments, "update", tournament.departmentId));
  }

  async create(dto: CreateTournamentDto): Promise<TournamentDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "create", dto.departmentId)) {
      throw new ForbiddenException("Not permitted to create a tournament in this department");
    }
    this.assertValidDateRange(dto.startsAt, dto.endsAt);

    const db = getTenantPrisma(context.tenantId);
    const department = await db.department.findUnique({ where: { id: dto.departmentId } });
    if (!department) {
      throw new NotFoundException("Department not found");
    }
    // Application-layer guardrail (mirrors TeamSeasonsService.create(),
    // Phase 9) — a FootballTournament may only belong to a FOOTBALL
    // department. Not enforced at the DB level for the same reason as
    // TeamSeason: a trigger cross-referencing department via a plain
    // departmentId column was judged disproportionate.
    if (department.sportType !== "FOOTBALL") {
      throw new BadRequestException("Tournaments can only be created for football departments");
    }

    if (dto.seasonId) {
      const season = await db.season.findUnique({ where: { id: dto.seasonId } });
      if (!season) {
        throw new NotFoundException("Season not found");
      }
      if (season.departmentId !== dto.departmentId) {
        throw new BadRequestException("The season must belong to the same department as the tournament");
      }
    }

    const tournament = await db.footballTournament.create({
      data: {
        tenantId: context.tenantId,
        departmentId: dto.departmentId,
        seasonId: dto.seasonId,
        name: dto.name,
        description: dto.description,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: dto.status ?? "DRAFT",
        mode: dto.mode,
      },
      include: TOURNAMENT_INCLUDE,
    });
    return this.toDto(tournament, true);
  }

  async update(id: string, dto: UpdateTournamentDto): Promise<TournamentDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.footballTournament.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Tournament not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", existing.departmentId)) {
      throw new ForbiddenException("Not permitted to update this tournament");
    }

    const startsAt = dto.startsAt ?? existing.startsAt.toISOString();
    const endsAt = dto.endsAt ?? existing.endsAt?.toISOString();
    this.assertValidDateRange(startsAt, endsAt);

    if (dto.seasonId) {
      const season = await db.season.findUnique({ where: { id: dto.seasonId } });
      if (!season) {
        throw new NotFoundException("Season not found");
      }
      if (season.departmentId !== existing.departmentId) {
        throw new BadRequestException("The season must belong to the same department as the tournament");
      }
    }

    const tournament = await db.footballTournament.update({
      where: { id },
      data: {
        seasonId: dto.seasonId,
        name: dto.name,
        description: dto.description,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: dto.status,
        mode: dto.mode,
      },
      include: TOURNAMENT_INCLUDE,
    });
    return this.toDto(tournament, true);
  }
}
