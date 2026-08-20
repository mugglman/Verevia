import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { Role, ScopeType } from "@verevia/database";

/**
 * Structural validation only (types/enum membership) — the business rule
 * that a given `role` requires exactly one specific `scopeType` (and
 * therefore exactly one of departmentId/teamId) lives in
 * PersonRolesService, not here, matching this codebase's existing
 * DTO-vs-service split (see teams/team-members for the same pattern).
 */
export class GrantRoleDto {
  @IsEnum(Role)
  role!: Role;

  @IsEnum(ScopeType)
  scopeType!: ScopeType;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
