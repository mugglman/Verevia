import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { InvitationsService } from "./invitations.service";

/**
 * Public endpoints — deliberately NOT behind TenantContextInterceptor.
 * `GET /api/v1/invitations/:token` needs no session at all (renders the
 * public /einladung/[token] page). `POST /api/v1/invitations/accept`
 * needs a real better-auth session (checked inside the service via
 * `auth.api.getSession()`) but cannot require an existing tenant
 * Membership — establishing that Membership is exactly what this call
 * does.
 */
@Controller({ path: "invitations", version: "1" })
export class PublicInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get(":token")
  lookup(@Param("token") token: string) {
    return this.invitationsService.lookupPublic(token);
  }

  @Post("accept")
  accept(@Body() dto: AcceptInvitationDto, @Req() request: Request) {
    return this.invitationsService.accept(dto.token, request.headers as Record<string, string>);
  }
}
