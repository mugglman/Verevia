import { Injectable } from "@nestjs/common";
import { getTenantPrisma } from "@verevia/database";
import { AuthorizationRoleAssignment } from "./authorization.service";

/**
 * Loads the authenticated Person's RoleAssignments within the active
 * tenant, including each TEAM-scoped assignment's Department (needed by
 * AuthorizationService to derive "own department" for team-scoped roles).
 */
@Injectable()
export class PersonRoleAssignmentsService {
  async load(tenantId: string, personId: string): Promise<AuthorizationRoleAssignment[]> {
    const db = getTenantPrisma(tenantId);
    const roleAssignments = await db.roleAssignment.findMany({
      where: { personId },
      select: {
        role: true,
        scopeType: true,
        departmentId: true,
        teamId: true,
        team: { select: { departmentId: true } },
      },
    });
    return roleAssignments;
  }
}
