import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, Prisma } from "@verevia/database";
import { AuthorizationService } from "../../../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../../../authorization/person-role-assignments.service";
import { CreateTournamentGroupDto } from "./dto/create-tournament-group.dto";
import { UpdateTournamentGroupDto } from "./dto/update-tournament-group.dto";

export interface TournamentGroupDto {
  id: string;
  tournamentId: string;
  name: string;
  displayOrder: number;
  canEdit: boolean;
}

@Injectable()
export class TournamentGroupsService {
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

  private async requireTournament(tenantId: string, tournamentId: string) {
    const db = getTenantPrisma(tenantId);
    const tournament = await db.footballTournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      throw new NotFoundException("Tournament not found");
    }
    return tournament;
  }

  private toDto(
    group: { id: string; tournamentId: string; name: string; displayOrder: number },
    canEdit: boolean,
  ): TournamentGroupDto {
    return { id: group.id, tournamentId: group.tournamentId, name: group.name, displayOrder: group.displayOrder, canEdit };
  }

  async list(tournamentId: string): Promise<TournamentGroupDto[]> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "read", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to read this tournament's groups");
    }
    const canEdit = this.authz.canOnSeason(assignments, "update", tournament.departmentId);
    const db = getTenantPrisma(context.tenantId);
    const groups = await db.tournamentGroup.findMany({
      where: { tournamentId },
      orderBy: { displayOrder: "asc" },
    });
    return groups.map((g) => this.toDto(g, canEdit));
  }

  async create(tournamentId: string, dto: CreateTournamentGroupDto): Promise<TournamentGroupDto> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "create", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to add groups to this tournament");
    }

    const db = getTenantPrisma(context.tenantId);
    try {
      const group = await db.tournamentGroup.create({
        data: {
          tenantId: context.tenantId,
          tournamentId,
          name: dto.name,
          displayOrder: dto.displayOrder ?? 0,
        },
      });
      return this.toDto(group, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A group with this name already exists in this tournament");
      }
      throw error;
    }
  }

  async update(tournamentId: string, groupId: string, dto: UpdateTournamentGroupDto): Promise<TournamentGroupDto> {
    const context = this.requireContext();
    const tournament = await this.requireTournament(context.tenantId, tournamentId);
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.tournamentGroup.findUnique({ where: { id: groupId } });
    if (!existing || existing.tournamentId !== tournamentId) {
      throw new NotFoundException("Tournament group not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnSeason(assignments, "update", tournament.departmentId)) {
      throw new ForbiddenException("Not permitted to update this tournament's groups");
    }

    try {
      const group = await db.tournamentGroup.update({
        where: { id: groupId },
        data: { name: dto.name, displayOrder: dto.displayOrder },
      });
      return this.toDto(group, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A group with this name already exists in this tournament");
      }
      throw error;
    }
  }
}
