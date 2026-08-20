import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { getTenantContext, prisma } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { UpdateClubDto } from "./dto/update-club.dto";

export interface ClubDto {
  id: string;
  name: string;
  slug: string;
  /** UI-support metadata — whether the caller may PATCH this club. */
  canEdit: boolean;
}

/**
 * `Tenant` carries no RLS policy (it is the root of the tenant hierarchy,
 * see packages/database/prisma/schema.prisma) — reading/writing it via the
 * plain `prisma` client, scoped explicitly by the already-validated
 * `tenantId` from the request's tenant context, is correct here (not a
 * bypass of anything; `TenantContextInterceptor` already confirmed an
 * active Membership for this exact tenant before this service runs).
 */
@Injectable()
export class ClubService {
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

  async getClub(): Promise<ClubDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnClub(assignments, "read")) {
      throw new ForbiddenException("Not permitted to read this club");
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: context.tenantId } });
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      canEdit: this.authz.canOnClub(assignments, "update"),
    };
  }

  async updateClub(dto: UpdateClubDto): Promise<ClubDto> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.authz.canOnClub(assignments, "update")) {
      throw new ForbiddenException("Not permitted to update this club");
    }

    const tenant = await prisma.tenant.update({
      where: { id: context.tenantId },
      data: { name: dto.name },
    });
    return { id: tenant.id, name: tenant.name, slug: tenant.slug, canEdit: true };
  }
}
