import { BadRequestException, Controller, Get, Headers, Param, ParseUUIDPipe } from "@nestjs/common";
import { PublicTournamentService } from "./public-tournament.service";

/**
 * Public endpoint — deliberately NOT behind TenantContextInterceptor (no
 * session, no Membership check), mirrors PublicInvitationsController's
 * established pattern. `X-Tenant-Id` is still required, but is resolved
 * and forwarded by apps/web itself (from its own pilot-tenant slug, see
 * apps/web/src/lib/tenant.ts) — never trusted as a claim of identity or
 * authorization, purely as "which tenant's public data to read", exactly
 * as every other endpoint's header is scoped by RLS regardless of trust
 * level (see PublicTournamentService doc comment).
 */
@Controller({ path: "public/tournaments", version: "1" })
export class PublicTournamentController {
  constructor(private readonly publicTournamentService: PublicTournamentService) {}

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @Headers("x-tenant-id") tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException("Missing X-Tenant-Id header");
    }
    return this.publicTournamentService.getPublicView(tenantId, id);
  }
}
