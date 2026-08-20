import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { getTenantContext, getTenantPrisma, prisma, Prisma, Role, ScopeType } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { GrantRoleDto } from "./dto/grant-role.dto";

export interface PersonRoleDto {
  id: string;
  role: Role;
  scopeType: ScopeType;
  departmentId: string | null;
  departmentName: string | null;
  teamId: string | null;
  teamName: string | null;
}

/**
 * Which scopeType a given Role requires — codifies the table already in
 * docs/product/Roles-and-Permissions.md, not a new invention. Enforced at
 * the application layer (Phase 5, section 7); the existing DB CHECK
 * constraint (`role_assignment_scope_consistency`, Phase 2) separately
 * guarantees internal scopeType/departmentId/teamId consistency but has no
 * way to know which scopeType a given Role enum value "should" have.
 */
const ROLE_SCOPE_MAP: Record<Role, ScopeType> = {
  TENANT_ADMIN: "TENANT",
  MEMBER: "TENANT",
  GUEST: "TENANT",
  DEPARTMENT_ADMIN: "DEPARTMENT",
  YOUTH_DIRECTOR: "DEPARTMENT",
  TEAM_MANAGER: "TEAM",
  COACH: "TEAM",
  ASSISTANT_COACH: "TEAM",
  PLAYER: "TEAM",
};

type RoleAssignmentWithNames = {
  id: string;
  role: Role;
  scopeType: ScopeType;
  departmentId: string | null;
  department: { name: string } | null;
  teamId: string | null;
  team: { name: string } | null;
};

@Injectable()
export class PersonRolesService {
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

  private async requireManageAccess(tenantId: string, callerPersonId: string): Promise<void> {
    const assignments = await this.roleAssignments.load(tenantId, callerPersonId);
    if (!this.authz.canManageRoleAssignments(assignments)) {
      throw new ForbiddenException("Not permitted to manage role assignments");
    }
  }

  private toDto(ra: RoleAssignmentWithNames): PersonRoleDto {
    return {
      id: ra.id,
      role: ra.role,
      scopeType: ra.scopeType,
      departmentId: ra.departmentId,
      departmentName: ra.department?.name ?? null,
      teamId: ra.teamId,
      teamName: ra.team?.name ?? null,
    };
  }

  async list(personId: string): Promise<PersonRoleDto[]> {
    const context = this.requireContext();
    await this.requireManageAccess(context.tenantId, context.personId!);

    const db = getTenantPrisma(context.tenantId);
    const person = await db.person.findUnique({ where: { id: personId } });
    if (!person) {
      throw new NotFoundException("Person not found");
    }

    const roles = await db.roleAssignment.findMany({
      where: { personId },
      include: { department: { select: { name: true } }, team: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return roles.map((r) => this.toDto(r));
  }

  async grant(personId: string, dto: GrantRoleDto): Promise<PersonRoleDto> {
    const context = this.requireContext();
    await this.requireManageAccess(context.tenantId, context.personId!);

    const db = getTenantPrisma(context.tenantId);
    const person = await db.person.findUnique({ where: { id: personId } });
    if (!person) {
      throw new NotFoundException("Person not found");
    }

    const requiredScope = ROLE_SCOPE_MAP[dto.role];
    if (dto.scopeType !== requiredScope) {
      throw new BadRequestException(
        `Role "${dto.role}" requires scopeType "${requiredScope}", got "${dto.scopeType}"`,
      );
    }
    if (requiredScope === "DEPARTMENT" && !dto.departmentId) {
      throw new BadRequestException(`Role "${dto.role}" requires departmentId`);
    }
    if (requiredScope === "TEAM" && !dto.teamId) {
      throw new BadRequestException(`Role "${dto.role}" requires teamId`);
    }
    if (requiredScope === "TENANT" && (dto.departmentId || dto.teamId)) {
      throw new BadRequestException(`Role "${dto.role}" must not set departmentId/teamId`);
    }

    // Existence pre-checks (friendly 404s); RLS + the composite FK in the
    // RoleAssignment migration are the actual, DB-level cross-tenant
    // guarantee — these lookups just happen to also confirm existence,
    // since a cross-tenant id would simply not be found under RLS.
    if (dto.departmentId) {
      const department = await db.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) {
        throw new NotFoundException("Department not found");
      }
    }
    if (dto.teamId) {
      const team = await db.team.findUnique({ where: { id: dto.teamId } });
      if (!team) {
        throw new NotFoundException("Team not found");
      }
    }

    try {
      const created = await db.roleAssignment.create({
        data: {
          tenantId: context.tenantId,
          personId,
          role: dto.role,
          scopeType: dto.scopeType,
          departmentId: dto.departmentId,
          teamId: dto.teamId,
          grantedByPersonId: context.personId,
        },
        include: { department: { select: { name: true } }, team: { select: { name: true } } },
      });
      return this.toDto(created);
    } catch (error) {
      // Race-condition safety net — the authoritative guarantee is the
      // unique index from migration 20260820142846_add_role_assignment_uniqueness.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This exact role assignment already exists");
      }
      throw error;
    }
  }

  async revoke(personId: string, roleAssignmentId: string): Promise<void> {
    const context = this.requireContext();
    await this.requireManageAccess(context.tenantId, context.personId!);

    const db = getTenantPrisma(context.tenantId);
    const existing = await db.roleAssignment.findUnique({ where: { id: roleAssignmentId } });
    if (!existing || existing.personId !== personId) {
      throw new NotFoundException("Role assignment not found");
    }

    if (existing.role === "TENANT_ADMIN" && existing.scopeType === "TENANT") {
      const hasOtherUsableAdmin = await this.hasOtherUsableTenantAdmin(
        context.tenantId,
        roleAssignmentId,
      );
      if (!hasOtherUsableAdmin) {
        throw new ConflictException(
          "Cannot remove the last active TENANT_ADMIN of this club — assign another TENANT_ADMIN first",
        );
      }
    }

    await db.roleAssignment.delete({ where: { id: roleAssignmentId } });
  }

  /**
   * Whether at least one OTHER TENANT_ADMIN/TENANT RoleAssignment (besides
   * `excludeRoleAssignmentId`) belongs to a Person with a working login (an
   * ACTIVE Membership) — Phase 5, section 14: a RoleAssignment on a Person
   * without any usable Membership could never actually be used to
   * administer the club, so it must not count as "an admin remains".
   */
  private async hasOtherUsableTenantAdmin(
    tenantId: string,
    excludeRoleAssignmentId: string,
  ): Promise<boolean> {
    const db = getTenantPrisma(tenantId);
    const others = await db.roleAssignment.findMany({
      where: {
        tenantId,
        role: "TENANT_ADMIN",
        scopeType: "TENANT",
        id: { not: excludeRoleAssignmentId },
      },
      select: { personId: true },
    });
    if (others.length === 0) return false;

    const activeMembership = await prisma.membership.findFirst({
      where: { personId: { in: others.map((o) => o.personId) }, status: "ACTIVE" },
      select: { id: true },
    });
    return activeMembership !== null;
  }
}
