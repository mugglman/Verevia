/**
 * German role labels and the role → required-scope mapping, mirroring
 * docs/product/Roles-and-Permissions.md exactly (not a new invention).
 * Shared between the client-side add-role form (conditional Abteilung/
 * Mannschaft picker) and the server action that grants a role (derives
 * `scopeType` from `role` itself rather than trusting a client-supplied
 * value).
 */

export type RoleName =
  | "TENANT_ADMIN"
  | "DEPARTMENT_ADMIN"
  | "YOUTH_DIRECTOR"
  | "TEAM_MANAGER"
  | "COACH"
  | "ASSISTANT_COACH"
  | "PLAYER"
  | "MEMBER"
  | "GUEST";

export type RoleScope = "TENANT" | "DEPARTMENT" | "TEAM";

export const ROLE_LABELS: Record<RoleName, string> = {
  TENANT_ADMIN: "Vereinsadministrator",
  DEPARTMENT_ADMIN: "Abteilungsleiter",
  YOUTH_DIRECTOR: "Jugendleiter",
  TEAM_MANAGER: "Mannschaftsadministrator",
  COACH: "Trainer",
  ASSISTANT_COACH: "Betreuer",
  PLAYER: "Spieler",
  MEMBER: "Mitglied",
  GUEST: "Gast",
};

export const ROLE_SCOPE: Record<RoleName, RoleScope> = {
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

export const ALL_ROLES = Object.keys(ROLE_LABELS) as RoleName[];

export function formatRoleLabel(
  role: string,
  departmentName: string | null,
  teamName: string | null,
): string {
  const base = ROLE_LABELS[role as RoleName] ?? role;
  if (departmentName) return `${base} ${departmentName}`;
  if (teamName) return `${base} ${teamName}`;
  return base;
}
