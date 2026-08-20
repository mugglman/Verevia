import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, Prisma } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { CreateTeamMemberDto } from "./dto/create-team-member.dto";

export interface TeamMemberDto {
  personId: string;
  firstName: string;
  lastName: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface TeamMemberListDto {
  items: TeamMemberDto[];
  canManage: boolean;
}

/**
 * "Teammitglied" hier bedeutet ausschließlich fachliche Mannschafts-
 * zugehörigkeit (`TeamMember`) — erteilt keine Berechtigung. Ob jemand
 * zusätzlich COACH dieses Teams ist, ist eine unabhängige RoleAssignment,
 * siehe schema.prisma-Kommentar am Modell `TeamMember`.
 */
@Injectable()
export class TeamMembersService {
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

  private async loadTeamOrThrow(tenantId: string, teamId: string) {
    const db = getTenantPrisma(tenantId);
    const team = await db.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException("Team not found");
    }
    return team;
  }

  async list(teamId: string): Promise<TeamMemberListDto> {
    const context = this.requireContext();
    const team = await this.loadTeamOrThrow(context.tenantId, teamId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.authz.canOnTeam(assignments, "read", { teamId: team.id, departmentId: team.departmentId })
    ) {
      throw new ForbiddenException("Not permitted to read this team's members");
    }
    const db = getTenantPrisma(context.tenantId);
    const members = await db.teamMember.findMany({
      where: { teamId, status: "ACTIVE" },
      include: { person: { select: { firstName: true, lastName: true } } },
      orderBy: [{ person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
    });
    return {
      items: members.map((m) => ({
        personId: m.personId,
        firstName: m.person.firstName,
        lastName: m.person.lastName,
        status: m.status,
      })),
      canManage: this.authz.canOnTeam(assignments, "update", { departmentId: team.departmentId }),
    };
  }

  async add(teamId: string, dto: CreateTeamMemberDto): Promise<TeamMemberDto> {
    const context = this.requireContext();
    const team = await this.loadTeamOrThrow(context.tenantId, teamId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnTeam(assignments, "update", { departmentId: team.departmentId })) {
      throw new ForbiddenException("Not permitted to add members to this team");
    }

    const db = getTenantPrisma(context.tenantId);
    const person = await db.person.findUnique({ where: { id: dto.personId } });
    if (!person) {
      throw new NotFoundException("Person not found");
    }

    const existing = await db.teamMember.findFirst({ where: { teamId, personId: dto.personId } });
    if (existing?.status === "ACTIVE") {
      throw new ConflictException("This person is already an active member of this team");
    }

    try {
      const member = existing
        ? await db.teamMember.update({ where: { id: existing.id }, data: { status: "ACTIVE" } })
        : await db.teamMember.create({
            data: { tenantId: context.tenantId, teamId, personId: dto.personId },
          });
      return {
        personId: member.personId,
        firstName: person.firstName,
        lastName: person.lastName,
        status: member.status,
      };
    } catch (error) {
      // Race-condition safety net — the authoritative guarantee is the
      // partial unique index (team_member_active_person_team_key), not this
      // pre-check.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This person is already an active member of this team");
      }
      throw error;
    }
  }

  async remove(teamId: string, personId: string): Promise<void> {
    const context = this.requireContext();
    const team = await this.loadTeamOrThrow(context.tenantId, teamId);
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnTeam(assignments, "update", { departmentId: team.departmentId })) {
      throw new ForbiddenException("Not permitted to remove members from this team");
    }

    const db = getTenantPrisma(context.tenantId);
    const existing = await db.teamMember.findFirst({
      where: { teamId, personId, status: "ACTIVE" },
    });
    if (!existing) {
      throw new NotFoundException("Active team membership not found");
    }
    // Soft removal (status → INACTIVE), not a row delete — see the
    // TeamMember schema comment: preserves "was once part of this team"
    // without deleting the Person or introducing full historisation.
    await db.teamMember.update({ where: { id: existing.id }, data: { status: "INACTIVE" } });
  }
}
