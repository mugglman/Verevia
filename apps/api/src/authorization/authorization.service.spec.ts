import { describe, expect, it } from "vitest";
import {
  AuthorizationRelationship,
  AuthorizationRoleAssignment,
  AuthorizationService,
} from "./authorization.service";

const authz = new AuthorizationService();

const DEPT_FOOTBALL = "dept-football";
const DEPT_TENNIS = "dept-tennis";
const TEAM_E1 = "team-e1";
const TEAM_E2 = "team-e2";

function tenantAdmin(): AuthorizationRoleAssignment[] {
  return [{ role: "TENANT_ADMIN", scopeType: "TENANT", departmentId: null, teamId: null, team: null }];
}

function departmentAdmin(departmentId: string): AuthorizationRoleAssignment[] {
  return [
    { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId, teamId: null, team: null },
  ];
}

function coachOfTeam(teamId: string, departmentId: string): AuthorizationRoleAssignment[] {
  return [
    {
      role: "COACH",
      scopeType: "TEAM",
      departmentId: null,
      teamId,
      team: { departmentId },
    },
  ];
}

function teamManagerOfTeam(teamId: string, departmentId: string): AuthorizationRoleAssignment[] {
  return [
    {
      role: "TEAM_MANAGER",
      scopeType: "TEAM",
      departmentId: null,
      teamId,
      team: { departmentId },
    },
  ];
}

function assistantCoachOfTeam(teamId: string, departmentId: string): AuthorizationRoleAssignment[] {
  return [
    {
      role: "ASSISTANT_COACH",
      scopeType: "TEAM",
      departmentId: null,
      teamId,
      team: { departmentId },
    },
  ];
}

describe("AuthorizationService — Club", () => {
  it("any role can read the club", () => {
    expect(authz.canOnClub(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read")).toBe(true);
  });

  it("no role at all cannot read the club", () => {
    expect(authz.canOnClub([], "read")).toBe(false);
  });

  it("TENANT_ADMIN can update the club", () => {
    expect(authz.canOnClub(tenantAdmin(), "update")).toBe(true);
  });

  it("COACH cannot update the club", () => {
    expect(authz.canOnClub(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "update")).toBe(false);
  });
});

describe("AuthorizationService — Department", () => {
  it("TENANT_ADMIN can create a department", () => {
    expect(authz.canOnDepartment(tenantAdmin(), "create")).toBe(true);
  });

  it("DEPARTMENT_ADMIN cannot create a department", () => {
    expect(authz.canOnDepartment(departmentAdmin(DEPT_FOOTBALL), "create")).toBe(false);
  });

  it("DEPARTMENT_ADMIN Fußball can update Fußball", () => {
    expect(authz.canOnDepartment(departmentAdmin(DEPT_FOOTBALL), "update", DEPT_FOOTBALL)).toBe(
      true,
    );
  });

  it("DEPARTMENT_ADMIN Fußball cannot update Tennis", () => {
    expect(authz.canOnDepartment(departmentAdmin(DEPT_FOOTBALL), "update", DEPT_TENNIS)).toBe(
      false,
    );
  });

  it("COACH of a team in Fußball can read Fußball (derived own-department)", () => {
    expect(
      authz.canOnDepartment(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read", DEPT_FOOTBALL),
    ).toBe(true);
  });

  it("COACH of a team in Fußball cannot read Tennis", () => {
    expect(authz.canOnDepartment(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read", DEPT_TENNIS)).toBe(
      false,
    );
  });
});

describe("AuthorizationService — Team", () => {
  it("TENANT_ADMIN can create a team", () => {
    expect(authz.canOnTeam(tenantAdmin(), "create", { departmentId: DEPT_FOOTBALL })).toBe(true);
  });

  it("DEPARTMENT_ADMIN Fußball can create a team in Fußball", () => {
    expect(
      authz.canOnTeam(departmentAdmin(DEPT_FOOTBALL), "create", { departmentId: DEPT_FOOTBALL }),
    ).toBe(true);
  });

  it("DEPARTMENT_ADMIN Fußball cannot create a team in Tennis", () => {
    expect(
      authz.canOnTeam(departmentAdmin(DEPT_FOOTBALL), "create", { departmentId: DEPT_TENNIS }),
    ).toBe(false);
  });

  it("COACH E1 can read E1", () => {
    expect(
      authz.canOnTeam(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(true);
  });

  it("COACH E1 cannot update E2 (no automatic write access to a sibling team)", () => {
    expect(
      authz.canOnTeam(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "update", {
        teamId: TEAM_E2,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(false);
  });

  it("COACH E1 cannot read E2", () => {
    expect(
      authz.canOnTeam(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read", {
        teamId: TEAM_E2,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(false);
  });
});

describe("AuthorizationService — Person", () => {
  it("TENANT_ADMIN can list persons", () => {
    expect(authz.canListPersons(tenantAdmin())).toBe(true);
  });

  it("DEPARTMENT_ADMIN can list persons", () => {
    expect(authz.canListPersons(departmentAdmin(DEPT_FOOTBALL))).toBe(true);
  });

  it("COACH cannot list persons", () => {
    expect(authz.canListPersons(coachOfTeam(TEAM_E1, DEPT_FOOTBALL))).toBe(false);
  });

  it("TENANT_ADMIN can create a person", () => {
    expect(authz.canOnPerson(tenantAdmin(), "create")).toBe(true);
  });

  it("DEPARTMENT_ADMIN cannot create a person", () => {
    expect(authz.canOnPerson(departmentAdmin(DEPT_FOOTBALL), "create")).toBe(false);
  });

  it("DEPARTMENT_ADMIN cannot update a person", () => {
    expect(authz.canOnPerson(departmentAdmin(DEPT_FOOTBALL), "update")).toBe(false);
  });
});

describe("AuthorizationService — Team members", () => {
  it("COACH E1 can read E1 members (via canOnTeam read)", () => {
    expect(
      authz.canOnTeam(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(true);
  });

  it("COACH E1 cannot read E2 members", () => {
    expect(
      authz.canOnTeam(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read", {
        teamId: TEAM_E2,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(false);
  });

  it("DEPARTMENT_ADMIN Fußball can assign/remove members of E1 (via canOnTeam update)", () => {
    expect(
      authz.canOnTeam(departmentAdmin(DEPT_FOOTBALL), "update", { departmentId: DEPT_FOOTBALL }),
    ).toBe(true);
  });

  it("DEPARTMENT_ADMIN Fußball cannot assign/remove members of a Tennis team", () => {
    expect(
      authz.canOnTeam(departmentAdmin(DEPT_FOOTBALL), "update", { departmentId: DEPT_TENNIS }),
    ).toBe(false);
  });

  it("COACH cannot assign/remove members even of their own team", () => {
    expect(
      authz.canOnTeam(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "update", {
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(false);
  });
});

describe("AuthorizationService — Role management", () => {
  it("TENANT_ADMIN can manage role assignments", () => {
    expect(authz.canManageRoleAssignments(tenantAdmin())).toBe(true);
  });

  it("DEPARTMENT_ADMIN cannot manage role assignments", () => {
    expect(authz.canManageRoleAssignments(departmentAdmin(DEPT_FOOTBALL))).toBe(false);
  });

  it("COACH cannot manage role assignments", () => {
    expect(authz.canManageRoleAssignments(coachOfTeam(TEAM_E1, DEPT_FOOTBALL))).toBe(false);
  });

  it("no role at all cannot manage role assignments", () => {
    expect(authz.canManageRoleAssignments([])).toBe(false);
  });
});

describe("AuthorizationService — getManagedDepartmentIds", () => {
  it("TENANT_ADMIN has no managed-department restriction (empty list)", () => {
    expect(authz.getManagedDepartmentIds(tenantAdmin())).toEqual([]);
  });

  it("DEPARTMENT_ADMIN Fußball is restricted to Fußball", () => {
    expect(authz.getManagedDepartmentIds(departmentAdmin(DEPT_FOOTBALL))).toEqual([
      DEPT_FOOTBALL,
    ]);
  });

  it("DEPARTMENT_ADMIN of two departments is restricted to both", () => {
    const assignments = [...departmentAdmin(DEPT_FOOTBALL), ...departmentAdmin(DEPT_TENNIS)];
    expect(authz.getManagedDepartmentIds(assignments).sort()).toEqual(
      [DEPT_FOOTBALL, DEPT_TENNIS].sort(),
    );
  });

  it("COACH has no managed departments", () => {
    expect(authz.getManagedDepartmentIds(coachOfTeam(TEAM_E1, DEPT_FOOTBALL))).toEqual([]);
  });
});

const PERSON_CHILD = "person-child";
const PERSON_OTHER_CHILD = "person-other-child";

function verifiedGuardian(toPersonId: string, type: "PARENT" | "LEGAL_GUARDIAN" = "LEGAL_GUARDIAN"): AuthorizationRelationship[] {
  return [{ type, status: "VERIFIED", toPersonId }];
}

describe("AuthorizationService — Invitations/Relationships management", () => {
  it("TENANT_ADMIN can manage invitations", () => {
    expect(authz.canManageInvitations(tenantAdmin())).toBe(true);
  });

  it("DEPARTMENT_ADMIN cannot manage invitations", () => {
    expect(authz.canManageInvitations(departmentAdmin(DEPT_FOOTBALL))).toBe(false);
  });

  it("COACH cannot manage invitations", () => {
    expect(authz.canManageInvitations(coachOfTeam(TEAM_E1, DEPT_FOOTBALL))).toBe(false);
  });

  it("TENANT_ADMIN can manage relationships", () => {
    expect(authz.canManageRelationships(tenantAdmin())).toBe(true);
  });

  it("DEPARTMENT_ADMIN cannot manage relationships", () => {
    expect(authz.canManageRelationships(departmentAdmin(DEPT_FOOTBALL))).toBe(false);
  });
});

describe("AuthorizationService — getGuardianChildPersonIds", () => {
  it("includes a VERIFIED LEGAL_GUARDIAN relationship's child", () => {
    expect(authz.getGuardianChildPersonIds(verifiedGuardian(PERSON_CHILD))).toEqual([
      PERSON_CHILD,
    ]);
  });

  it("includes a VERIFIED PARENT relationship's child", () => {
    expect(authz.getGuardianChildPersonIds(verifiedGuardian(PERSON_CHILD, "PARENT"))).toEqual([
      PERSON_CHILD,
    ]);
  });

  it("excludes a PENDING (unverified) relationship", () => {
    const relationships: AuthorizationRelationship[] = [
      { type: "LEGAL_GUARDIAN", status: "PENDING", toPersonId: PERSON_CHILD },
    ];
    expect(authz.getGuardianChildPersonIds(relationships)).toEqual([]);
  });

  it("excludes an EMERGENCY_CONTACT relationship even if VERIFIED", () => {
    const relationships: AuthorizationRelationship[] = [
      { type: "EMERGENCY_CONTACT", status: "VERIFIED", toPersonId: PERSON_CHILD },
    ];
    expect(authz.getGuardianChildPersonIds(relationships)).toEqual([]);
  });

  it("excludes a REVOKED relationship", () => {
    const relationships: AuthorizationRelationship[] = [
      { type: "LEGAL_GUARDIAN", status: "REVOKED", toPersonId: PERSON_CHILD },
    ];
    expect(authz.getGuardianChildPersonIds(relationships)).toEqual([]);
  });
});

describe("AuthorizationService — canAccessPersonAsSelfOrGuardian", () => {
  it("a User can access their own linked Person (SELF)", () => {
    expect(authz.canAccessPersonAsSelfOrGuardian(PERSON_CHILD, PERSON_CHILD, [])).toBe(true);
  });

  it("a verified guardian can access their own child (RELATIONSHIP)", () => {
    expect(
      authz.canAccessPersonAsSelfOrGuardian(
        "person-guardian",
        PERSON_CHILD,
        verifiedGuardian(PERSON_CHILD),
      ),
    ).toBe(true);
  });

  it("a verified guardian cannot access a different child", () => {
    expect(
      authz.canAccessPersonAsSelfOrGuardian(
        "person-guardian",
        PERSON_OTHER_CHILD,
        verifiedGuardian(PERSON_CHILD),
      ),
    ).toBe(false);
  });

  it("an emergency contact has no automatic access", () => {
    const relationships: AuthorizationRelationship[] = [
      { type: "EMERGENCY_CONTACT", status: "VERIFIED", toPersonId: PERSON_CHILD },
    ];
    expect(
      authz.canAccessPersonAsSelfOrGuardian("person-contact", PERSON_CHILD, relationships),
    ).toBe(false);
  });

  it("an unrelated person has no access", () => {
    expect(authz.canAccessPersonAsSelfOrGuardian("person-stranger", PERSON_CHILD, [])).toBe(
      false,
    );
  });
});

describe("AuthorizationService — Venue", () => {
  it("any role can read venues", () => {
    expect(authz.canOnVenue(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read")).toBe(true);
  });

  it("no role at all cannot read venues", () => {
    expect(authz.canOnVenue([], "read")).toBe(false);
  });

  it("TENANT_ADMIN can create/update venues", () => {
    expect(authz.canOnVenue(tenantAdmin(), "create")).toBe(true);
    expect(authz.canOnVenue(tenantAdmin(), "update")).toBe(true);
  });

  it("DEPARTMENT_ADMIN cannot create/update venues (tenant-wide shared resource)", () => {
    expect(authz.canOnVenue(departmentAdmin(DEPT_FOOTBALL), "create")).toBe(false);
    expect(authz.canOnVenue(departmentAdmin(DEPT_FOOTBALL), "update")).toBe(false);
  });

  it("COACH cannot create/update venues", () => {
    expect(authz.canOnVenue(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "update")).toBe(false);
  });
});

describe("AuthorizationService — Match", () => {
  it("TENANT_ADMIN can create a match anywhere", () => {
    expect(
      authz.canOnMatch(tenantAdmin(), "create", { teamId: TEAM_E1, departmentId: DEPT_FOOTBALL }),
    ).toBe(true);
  });

  it("DEPARTMENT_ADMIN Fußball can create/update a Fußball match", () => {
    expect(
      authz.canOnMatch(departmentAdmin(DEPT_FOOTBALL), "create", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(true);
  });

  it("DEPARTMENT_ADMIN Fußball cannot create/update a Tennis match", () => {
    expect(
      authz.canOnMatch(departmentAdmin(DEPT_FOOTBALL), "create", {
        teamId: "team-tennis-1",
        departmentId: DEPT_TENNIS,
      }),
    ).toBe(false);
  });

  it("COACH E1 can create/update E1's own match", () => {
    expect(
      authz.canOnMatch(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "create", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(true);
    expect(
      authz.canOnMatch(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "update", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(true);
  });

  it("TEAM_MANAGER E1 can create/update E1's own match", () => {
    expect(
      authz.canOnMatch(teamManagerOfTeam(TEAM_E1, DEPT_FOOTBALL), "create", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(true);
  });

  it("COACH E1 cannot update E2's match", () => {
    expect(
      authz.canOnMatch(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "update", {
        teamId: TEAM_E2,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(false);
  });

  it("COACH E1 can read E1's match", () => {
    expect(
      authz.canOnMatch(coachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(true);
  });

  it("ASSISTANT_COACH E1 can read but not create/update E1's match", () => {
    expect(
      authz.canOnMatch(assistantCoachOfTeam(TEAM_E1, DEPT_FOOTBALL), "read", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(true);
    expect(
      authz.canOnMatch(assistantCoachOfTeam(TEAM_E1, DEPT_FOOTBALL), "create", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(false);
    expect(
      authz.canOnMatch(assistantCoachOfTeam(TEAM_E1, DEPT_FOOTBALL), "update", {
        teamId: TEAM_E1,
        departmentId: DEPT_FOOTBALL,
      }),
    ).toBe(false);
  });

  it("no role at all cannot read or write a match", () => {
    expect(authz.canOnMatch([], "read", { teamId: TEAM_E1, departmentId: DEPT_FOOTBALL })).toBe(
      false,
    );
  });
});
