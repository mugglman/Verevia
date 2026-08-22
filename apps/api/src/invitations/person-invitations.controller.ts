import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { InvitationsService } from "./invitations.service";

@Controller({ path: "persons/:personId/invitations", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class PersonInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  list(@Param("personId", ParseUUIDPipe) personId: string) {
    return this.invitationsService.list(personId);
  }

  @Post()
  create(@Param("personId", ParseUUIDPipe) personId: string, @Body() dto: CreateInvitationDto) {
    return this.invitationsService.create(personId, dto.email);
  }

  @Delete(":invitationId")
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param("personId", ParseUUIDPipe) personId: string,
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
  ) {
    return this.invitationsService.revoke(personId, invitationId);
  }
}
