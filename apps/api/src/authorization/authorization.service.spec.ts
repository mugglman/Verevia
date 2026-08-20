import { describe, expect, it } from "vitest";
import { AuthorizationRoleAssignment, AuthorizationService } from "./authorization.service";

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
