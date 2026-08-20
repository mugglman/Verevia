import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { firstValueFrom, from, Observable } from "rxjs";
import { auth } from "@verevia/auth";
import { prisma, runWithTenantContext } from "@verevia/database";

/**
 * Establishes the request-scoped tenant context per
 * docs/ARCHITEKTUR_FINALISIERUNG.md, section 7 / ADR 0006:
 *
 *   Request → resolve session (better-auth) → resolve tenant (header,
 *   placeholder for subdomain/session-based resolution) → validate
 *   Membership → AsyncLocalStorage → downstream handler.
 *
 * The client-supplied tenant identifier (currently the `X-Tenant-Id`
 * header — a stand-in until real subdomain-based resolution lands with the
 * web app) is NEVER trusted directly: a request is only allowed through if
 * an ACTIVE Membership links the authenticated user to a Person in exactly
 * that tenant.
 *
 * Not wired to any controller yet — there are no domain endpoints in this
 * work package ("noch keine fachliche Oberfläche"). This is the tested,
 * reusable building block future controllers attach via
 * `@UseInterceptors(TenantContextInterceptor)`.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    return from(this.resolveAndRun(request, next));
  }

  private async resolveAndRun(request: Request, next: CallHandler): Promise<unknown> {
    const tenantId = request.headers["x-tenant-id"];
    if (!tenantId || typeof tenantId !== "string") {
      throw new ForbiddenException("Missing X-Tenant-Id header");
    }

    const session = await auth.api.getSession({
      headers: new Headers(request.headers as Record<string, string>),
    });
    if (!session) {
      throw new UnauthorizedException("No active session");
    }

    // Membership itself is not tenant-scoped/RLS-protected, but this lookup
    // joins into `Person`, which IS RLS-protected — without setting
    // app.tenant_id first, the join would silently see zero Person rows and
    // every request would be rejected even for legitimate members. Scoping
    // this validation query to the CLAIMED tenantId is safe: it only
    // determines whether that claim is backed by a real, active membership,
    // it does not itself grant access to anything.
    const membership = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return tx.membership.findFirst({
        where: {
          userId: session.user.id,
          status: "ACTIVE",
          person: { tenantId },
        },
        select: { personId: true },
      });
    });

    if (!membership) {
      throw new ForbiddenException(
        "No active membership for the requesting user in this tenant",
      );
    }

    return runWithTenantContext(
      { tenantId, userId: session.user.id, personId: membership.personId },
      () => firstValueFrom(next.handle()),
    );
  }
}
