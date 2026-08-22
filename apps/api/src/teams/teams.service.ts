import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRelationshipsAuthService } from "../authorization/person-relationships-auth.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { CreateTeamDto } from "./dto/create-team.dto";
import { ListTeamsQueryDto } from "./dto/list-teams-query.dto";
import { UpdateTeamDto } from "./dto/update-team.dto";

export interface TeamDto {
  id: string;
  name: string;
  departmentId: string;
  canEdit: boolean;
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly roleAssignments: PersonRoleAssignmentsService,
    private readonly relationshipsAuth: PersonRelationshipsAuthService,
  ) {}

  private requireContext() {
    const context = getTenantContext();
    if (!context?.personId) {
      throw new UnauthorizedException("No active tenant context");
    }
    return context;
  }

  async list(query: ListTeamsQueryDto): Promise<TeamDto[]> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const teams = await db.team.findMany({
      where: query.departmentId ? { departmentId: query.departmentId } : undefined,
      orderBy: { name: "asc" },
    });
    return teams
      .filter((t) =>
        this.authz.canOnTeam(assignments, "read", { teamId: t.id, departmentId: t.departmentId }),
      )
      .map((t) => ({
        id: t.id,
        name: t.name,
        departmentId: t.departmentId,
        canEdit: this.authz.canOnTeam(assignments, "update", {
          teamId: t.id,
          departmentId: t.departmentId,
        }),
      }));
  }

  async getById(id: string): Promise<TeamDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const team = await db.team.findUnique({ where: { id } });
    if (!team) {
      throw new NotFoundException("Team not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    let canRead = this.authz.canOnTeam(assignments, "read", {
      teamId: team.id,
      departmentId: team.departmentId,
    });
    if (!canRead) {
      // ReBAC fallback (Phase 6, section 17: "GET Team des Kindes") — a
      // verified guardian may read a team that at least one of their
      // children is an active member of.
      const relationships = await this.relationshipsAuth.loadAsGuardian(
        context.tenantId,
        context.personId!,
      );
      const childIds = this.authz.getGuardianChildPersonIds(relationships);
      if (childIds.length > 0) {
        const db2 = getTenantPrisma(context.tenantId);
        const guardianMembership = await db2.teamMember.findFirst({
          where: { teamId: team.id, personId: { in: childIds }, status: "ACTIVE" },
        });
        canRead = guardianMembership !== null;
      }
    }
    if (!canRead) {
      throw new ForbiddenException("Not permitted to read this team");
    }
    return {
      id: team.id,
      name: team.name,
      departmentId: team.departmentId,
      canEdit: this.authz.canOnTeam(assignments, "update", {
        teamId: team.id,
        departmentId: team.departmentId,
      }),
    };
  }

  async create(dto: CreateTeamDto): Promise<TeamDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnTeam(assignments, "create", { departmentId: dto.departmentId })) {
      throw new ForbiddenException("Not permitted to create a team in this department");
    }
    const db = getTenantPrisma(context.tenantId);
    const department = await db.department.findUnique({ where: { id: dto.departmentId } });
    if (!department) {
      throw new NotFoundException("Department not found");
    }
    const team = await db.team.create({
      data: { tenantId: context.tenantId, departmentId: dto.departmentId, name: dto.name },
    });
    return { id: team.id, name: team.name, departmentId: team.departmentId, canEdit: true };
  }

  async update(id: string, dto: UpdateTeamDto): Promise<TeamDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.team.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Team not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnTeam(assignments, "update", {
        teamId: existing.id,
        departmentId: existing.departmentId,
      })
    ) {
      throw new ForbiddenException("Not permitted to update this team");
    }
    const team = await db.team.update({ where: { id }, data: { name: dto.name } });
    return { id: team.id, name: team.name, departmentId: team.departmentId, canEdit: true };
  }
}
