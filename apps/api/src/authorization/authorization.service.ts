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
 * The subset of a PersonRelationship's fields needed for ReBAC decisions
 * (Phase 6) — always from the perspective of the relationship's
 * `fromPerson` (the potential guardian); `toPersonId` is the (potential)
 * child.
 */
export interface AuthorizationRelationship {
  type: "PARENT" | "LEGAL_GUARDIAN" | "EMERGENCY_CONTACT";
  status: "PENDING" | "VERIFIED" | "REVOKED";
  toPersonId: string;
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

  /**
   * Granting/revoking RoleAssignments is TENANT_ADMIN-only in this phase
   * (Phase 5, section 12) — deliberately, to avoid delegation/privilege-
   * escalation complexity (a DEPARTMENT_ADMIN granting DEPARTMENT_ADMIN to
   * someone else, etc.). Reading a person's roles follows the same rule:
   * role/permission data is itself sensitive, scoped no wider than the
   * management capability.
   */
  canManageRoleAssignments(roleAssignments: AuthorizationRoleAssignment[]): boolean {
    return this.isTenantAdmin(roleAssignments);
  }

  /**
   * Department IDs the caller administers (DEPARTMENT_ADMIN scope) — used
   * to scope the Person list to persons associated with the caller's own
   * department(s) via TeamMember (Phase 5, section 24: DEPARTMENT_ADMIN
   * must not see the whole tenant's persons). Empty for TENANT_ADMIN
   * (unrestricted) and for roles without DEPARTMENT_ADMIN.
   */
  getManagedDepartmentIds(roleAssignments: AuthorizationRoleAssignment[]): string[] {
    return roleAssignments
      .filter((ra) => ra.scopeType === "DEPARTMENT" && ra.role === "DEPARTMENT_ADMIN")
      .map((ra) => ra.departmentId)
      .filter((id): id is string => id !== null);
  }

  /** Sending/revoking account invitations is TENANT_ADMIN-only (Phase 6, section 8). */
  canManageInvitations(roleAssignments: AuthorizationRoleAssignment[]): boolean {
    return this.isTenantAdmin(roleAssignments);
  }

  /**
   * Creating/administratively verifying PersonRelationships is
   * TENANT_ADMIN-only (Phase 6, section 16) — deliberately no automatic
   * legal verification workflow yet, see PHASE_6_GUARDIAN_INVITATIONS_REPORT.md.
   */
  canManageRelationships(roleAssignments: AuthorizationRoleAssignment[]): boolean {
    return this.isTenantAdmin(roleAssignments);
  }

  /**
   * The tenant-wide list of Persons a given caller has verified guardian
   * access to (Phase 6, sections 17/18): only VERIFIED `PARENT`/
   * `LEGAL_GUARDIAN` relationships grant read access to a child's data —
   * `EMERGENCY_CONTACT` and unverified (`PENDING`) relationships
   * deliberately do not (a relationship record alone is not an
   * authorization grant).
   */
  getGuardianChildPersonIds(relationships: AuthorizationRelationship[]): string[] {
    return relationships
      .filter(
        (r) =>
          r.status === "VERIFIED" && (r.type === "PARENT" || r.type === "LEGAL_GUARDIAN"),
      )
      .map((r) => r.toPersonId);
  }

  /**
   * The three coexisting read-access paths for a Person's own data (Phase
   * 6, section 19): SELF (a User reading their own linked Person) or
   * RELATIONSHIP (a verified guardian reading their own child) — RBAC
   * (`canListPersons`/`canOnPerson`) is evaluated separately by the
   * caller alongside this, not folded in here, since it depends on
   * context this method doesn't need (department scope etc.).
   */
  canAccessPersonAsSelfOrGuardian(
    callerPersonId: string,
    targetPersonId: string,
    callerRelationships: AuthorizationRelationship[],
  ): boolean {
    if (callerPersonId === targetPersonId) return true;
    return this.getGuardianChildPersonIds(callerRelationships).includes(targetPersonId);
  }

  /**
   * Season is department-scoped (Phase 9, section 16) — deliberately NOT
   * a plain reuse of `canOnDepartment`: that method's `create` is
   * TENANT_ADMIN-only because creating a DEPARTMENT itself is
   * TENANT_ADMIN-only, but a DEPARTMENT_ADMIN of that department is
   * explicitly allowed to create/update SEASONS within their own
   * department (a child resource, not the department itself) — see the
   * work order, section 15. Read follows the same department-scope
   * cascade as `canOnDepartment` (department-scoped role in that
   * department, or a team-scoped role whose team belongs to it — derives
   * "own department" for e.g. COACH).
   */
  canOnSeason(
    roleAssignments: AuthorizationRoleAssignment[],
    action: Action,
    departmentId?: string,
  ): boolean {
    if (this.isTenantAdmin(roleAssignments)) return true;
    if (!departmentId) return false;

    if (action === "create" || action === "update") {
      return this.isDepartmentAdminOf(roleAssignments, departmentId);
    }

    // read
    return roleAssignments.some(
      (ra) =>
        (ra.scopeType === "DEPARTMENT" && ra.departmentId === departmentId) ||
        (ra.scopeType === "TEAM" && ra.team?.departmentId === departmentId),
    );
  }

  /**
   * FootballTournament authorization (Phase 11, section 30/31) is
   * deliberately a direct reuse of `canOnSeason` (not a new method) — the
   * desired rule set is byte-for-byte identical: TENANT_ADMIN always;
   * DEPARTMENT_ADMIN of the tournament's department may create/update
   * (explicitly restricted to these two roles for Phase 11 — TEAM_MANAGER/
   * COACH read-only, no tournament creation for them in this phase); read
   * follows the same department-scope cascade (department-scoped role in
   * that department, or a team-scoped role whose team belongs to it).
   * `TournamentParticipant`/`TournamentVenue`/`TournamentGroup` reuse the
   * SAME check via their parent tournament's `departmentId` — they are
   * child resources of a tournament, not independently authorized
   * resources, exactly like `TeamSeason` reuses `canOnTeam` below. See
   * call sites in `TournamentsService`/`TournamentParticipantsService`/etc.
   */

  /**
   * TeamSeason authorization is deliberately a direct reuse of
   * `canOnTeam` (not a new method) — a TeamSeason is a season-specific
   * attachment to an existing Team, and the desired rule set is
   * identical: TENANT_ADMIN always; DEPARTMENT_ADMIN of the team's
   * department may create/update; a TEAM-scoped role (e.g. COACH) may
   * read their own team's TeamSeason but not another team's (Phase 9,
   * section 15/16 — "COACH E1 darf keine TeamSeason E2 bearbeiten"). See
   * call sites in TeamSeasonsService.
   */

  /**
   * AgeGroup is tenant-wide reference data (Phase 9, section 15 lists it
   * only under TENANT_ADMIN — "Altersklassen verwalten" — unlike Season/
   * TeamSeason there is no DEPARTMENT_ADMIN carve-out, since an AgeGroup
   * isn't owned by any one department).
   */
  canManageAgeGroups(roleAssignments: AuthorizationRoleAssignment[]): boolean {
    return this.isTenantAdmin(roleAssignments);
  }

  /**
   * Reading AgeGroups (reference/lookup data, not sensitive) follows the
   * same "any active RoleAssignment implies read access" rule as
   * `canOnClub` — every tenant member needs to be able to look them up
   * (e.g. to render a TeamSeason's age group label).
   */
  canReadAgeGroups(roleAssignments: AuthorizationRoleAssignment[]): boolean {
    return roleAssignments.length > 0;
  }

  /**
   * Venue is tenant-wide, sport-neutral reference data (Phase 10, section
   * 25) — same shape as AgeGroup: TENANT_ADMIN manages (create/update),
   * any active RoleAssignment may read. Deliberately NO DEPARTMENT_ADMIN
   * create/update carve-out — a Venue can be shared across departments/
   * sports (e.g. a Sporthalle used by both Fußball and Tennis), so
   * "the department that happens to have booked it first" has no
   * ownership claim over it; scoping write access to TENANT_ADMIN avoids
   * that ambiguity entirely.
   */
  canOnVenue(roleAssignments: AuthorizationRoleAssignment[], action: Action): boolean {
    if (action === "read") return roleAssignments.length > 0;
    return this.isTenantAdmin(roleAssignments);
  }

  /**
   * FootballMatch authorization (Phase 10, section 26/27) — deliberately a
   * NEW method, not a reuse of `canOnTeam`: `canOnTeam`'s create/update is
   * DEPARTMENT_ADMIN-only (a Team itself is an administrative resource),
   * but a Match is a day-to-day scheduling resource that COACH/
   * TEAM_MANAGER of the owning team must be able to create/update
   * themselves (see work order: "COACH: Matches des eigenen Teams
   * verwalten") — a genuinely different rule, not a superficially similar
   * one. ASSISTANT_COACH/PLAYER/other TEAM-scoped roles get read-only,
   * per the "Betreuer = Unterstützung" role description in
   * Roles-and-Permissions.md — an assistant coach is not the one who
   * schedules/reschedules matches on their own authority.
   */
  canOnMatch(
    roleAssignments: AuthorizationRoleAssignment[],
    action: Action,
    context: { teamId?: string; departmentId?: string },
  ): boolean {
    if (this.isTenantAdmin(roleAssignments)) return true;

    const departmentAdmin = context.departmentId
      ? this.isDepartmentAdminOf(roleAssignments, context.departmentId)
      : false;
    if (departmentAdmin) return true;

    if (!context.teamId) return false;

    if (action === "read") {
      return roleAssignments.some((ra) => ra.scopeType === "TEAM" && ra.teamId === context.teamId);
    }

    // create/update: only team-management roles, not every TEAM-scoped role.
    return roleAssignments.some(
      (ra) =>
        ra.scopeType === "TEAM" &&
        ra.teamId === context.teamId &&
        (ra.role === "COACH" || ra.role === "TEAM_MANAGER"),
    );
  }
}
