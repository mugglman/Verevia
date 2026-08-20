import { Injectable } from "@nestjs/common";

export type Action = "read" | "create" | "update";

/**
 * The subset of a RoleAssignment's fields needed for authorization
 * decisions, including the department a TEAM-scoped assignment's team
 * belongs to (needed to derive "read own department" for team-scoped
 * roles like COACH — see `canOnDepartment`).
 */
export interface AuthorizationRoleAssignment {
  role: string;
  scopeType: "TENANT" | "DEPARTMENT" | "TEAM";
  departmentId: string | null;
  teamId: string | null;
  team: { departmentId: string } | null;
}

/**
 * First real authorization layer, per the Phase 3 work order, section 16/17.
 * Deliberately a small, hand-written service rather than a CASL setup: the
 * current permission surface is 3 resources × 3 actions, and a
 * purpose-built, directly-unit-testable service is simpler to reason about
 * correctly than introducing a rule-matching library for this size of
 * problem ("keine unnötig komplexe Architektur"). `docs/AUTH_IDENTITY_RBAC_ARCHITEKTUR.md`
 * still recommends CASL as the eventual tool once the permission surface
 * grows (tournaments, attendance, …); this service is structured the same
 * way a CASL ability would be built (resolved from a Person's
 * RoleAssignments) so migrating later is a mechanical change, not a
 * redesign.
 *
 * Only the roles explicitly specified are implemented with distinct rules
 * (TENANT_ADMIN, DEPARTMENT_ADMIN, COACH); every other scoped role falls
 * back to the same generic "read own scope" behavior as COACH — this is a
 * deliberate, minimal generalization, not a new invented permission (see
 * `Roles-and-Permissions.md`: no role should have LESS access than
 * read-only within its own assigned scope).
 */
@Injectable()
export class AuthorizationService {
  private isTenantAdmin(roleAssignments: AuthorizationRoleAssignment[]): boolean {
    return roleAssignments.some(
      (ra) => ra.scopeType === "TENANT" && ra.role === "TENANT_ADMIN",
    );
  }

  private isDepartmentAdminOf(
    roleAssignments: AuthorizationRoleAssignment[],
    departmentId: string,
  ): boolean {
    return roleAssignments.some(
      (ra) =>
        ra.scopeType === "DEPARTMENT" &&
        ra.role === "DEPARTMENT_ADMIN" &&
        ra.departmentId === departmentId,
    );
  }

  /** Any active RoleAssignment in the tenant implies read access to the club itself. */
  canOnClub(roleAssignments: AuthorizationRoleAssignment[], action: Action): boolean {
    if (roleAssignments.length === 0) return false;
    if (action === "read") return true;
    return this.isTenantAdmin(roleAssignments);
  }

  canOnDepartment(
    roleAssignments: AuthorizationRoleAssignment[],
    action: Action,
    departmentId?: string,
  ): boolean {
    if (this.isTenantAdmin(roleAssignments)) return true;

    if (action === "create") return false; // only TENANT_ADMIN creates departments

    if (!departmentId) return false;

    if (action === "update") {
      return this.isDepartmentAdminOf(roleAssignments, departmentId);
    }

    // read: department-scoped roles in this department, or team-scoped
    // roles whose team belongs to this department (derives "own
    // department" for e.g. COACH — see class docstring).
    return roleAssignments.some(
      (ra) =>
        (ra.scopeType === "DEPARTMENT" && ra.departmentId === departmentId) ||
        (ra.scopeType === "TEAM" && ra.team?.departmentId === departmentId),
    );
  }

  canOnTeam(
    roleAssignments: AuthorizationRoleAssignment[],
    action: Action,
    context: { teamId?: string; departmentId?: string },
  ): boolean {
    if (this.isTenantAdmin(roleAssignments)) return true;

    const departmentAdmin = context.departmentId
      ? this.isDepartmentAdminOf(roleAssignments, context.departmentId)
      : false;

    if (action === "create" || action === "update") {
      return departmentAdmin;
    }

    // read
    if (departmentAdmin) return true;
    if (!context.teamId) return false;
    return roleAssignments.some(
      (ra) => ra.scopeType === "TEAM" && ra.teamId === context.teamId,
    );
  }

  /**
   * A global person list/lookup is restricted to administrative roles
   * (Phase 4, section 16 — "COACH darf nicht sämtliche Personen des
   * Vereins abrufen"). DEPARTMENT_ADMIN is included: without it, they
   * would have no way to find an existing Person to assign to a team in
   * their own department (Person carries no department linkage of its
   * own — the only association is via TeamMember/RoleAssignment). This
   * means a DEPARTMENT_ADMIN can see persons unrelated to their own
   * department too; documented as a known, deliberate simplification
   * (see PHASE_4_TEAM_MEMBERSHIP_REPORT.md) rather than building
   * per-department Person filtering this early.
   */
  canListPersons(roleAssignments: AuthorizationRoleAssignment[]): boolean {
    if (this.isTenantAdmin(roleAssignments)) return true;
    return roleAssignments.some(
      (ra) => ra.scopeType === "DEPARTMENT" && ra.role === "DEPARTMENT_ADMIN",
    );
  }

  /** Creating/editing a Person's own record is TENANT_ADMIN-only (section 15); reading follows canListPersons. */
  canOnPerson(roleAssignments: AuthorizationRoleAssignment[], action: Action): boolean {
    if (action === "read") return this.canListPersons(roleAssignments);
    return this.isTenantAdmin(roleAssignments);
  }
}
