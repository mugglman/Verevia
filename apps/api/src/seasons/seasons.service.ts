import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, Prisma, SeasonStatus } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { CreateSeasonDto } from "./dto/create-season.dto";
import { ListSeasonsQueryDto } from "./dto/list-seasons-query.dto";
import { UpdateSeasonDto } from "./dto/update-season.dto";

export interface SeasonDto {
  id: string;
  departmentId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;
  canEdit: boolean;
}

@Injectable()
export class SeasonsService {
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
    season: {
      id: string;
      departmentId: string;
      name: string;
      startsAt: Date;
      endsAt: Date;
      status: SeasonStatus;
    },
    canEdit: boolean,
  ): SeasonDto {
    return {
      id: season.id,
      departmentId: season.departmentId,
      name: season.name,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      status: season.status,
      canEdit,
    };
  }

  private assertValidDateRange(startsAt: string, endsAt: string) {
    if (new Date(startsAt) >= new Date(endsAt)) {
      throw new BadRequestException("startsAt must be before endsAt");
    }
  }

  async list(query: ListSeasonsQueryDto): Promise<SeasonDto[]> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const seasons = await db.season.findMany({
      where: query.departmentId ? { departmentId: query.departmentId } : undefined,
      orderBy: { startsAt: "desc" },
    });
    return seasons
      .filter((s) => this.authz.canOnSeason(assignments, "read", s.departmentId))
      .map((s) =>
        this.toDto(s, this.authz.canOnSeason(assignments, "update", s.departmentId)),
      );
  }

  async getById(id: string): Promise<SeasonDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const season = await db.season.findUnique({ where: { id } });
    if (!season) {
      throw new NotFoundException("Season not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "read", season.departmentId)) {
      throw new ForbiddenException("Not permitted to read this season");
    }
    return this.toDto(season, this.authz.canOnSeason(assignments, "update", season.departmentId));
  }

  async create(dto: CreateSeasonDto): Promise<SeasonDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "create", dto.departmentId)) {
      throw new ForbiddenException("Not permitted to create a season in this department");
    }
    this.assertValidDateRange(dto.startsAt, dto.endsAt);

    const db = getTenantPrisma(context.tenantId);
    const department = await db.department.findUnique({ where: { id: dto.departmentId } });
    if (!department) {
      throw new NotFoundException("Department not found");
    }

    try {
      const season = await db.season.create({
        data: {
          tenantId: context.tenantId,
          departmentId: dto.departmentId,
          name: dto.name,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
          status: dto.status ?? "PLANNED",
        },
      });
      return this.toDto(season, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          "This department already has an active season, or a season with this name already exists",
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateSeasonDto): Promise<SeasonDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.season.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Season not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", existing.departmentId)) {
      throw new ForbiddenException("Not permitted to update this season");
    }

    const startsAt = dto.startsAt ?? existing.startsAt.toISOString();
    const endsAt = dto.endsAt ?? existing.endsAt.toISOString();
    this.assertValidDateRange(startsAt, endsAt);

    try {
      const season = await db.season.update({
        where: { id },
        data: {
          name: dto.name,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          status: dto.status,
        },
      });
      return this.toDto(season, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          "This department already has an active season, or a season with this name already exists",
        );
      }
      throw error;
    }
  }
}
