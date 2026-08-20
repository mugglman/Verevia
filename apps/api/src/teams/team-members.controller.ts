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
import { CreateTeamMemberDto } from "./dto/create-team-member.dto";
import { TeamMembersService } from "./team-members.service";

@Controller({ path: "teams/:teamId/members", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class TeamMembersController {
  constructor(private readonly teamMembersService: TeamMembersService) {}

  @Get()
  list(@Param("teamId", ParseUUIDPipe) teamId: string) {
    return this.teamMembersService.list(teamId);
  }

  @Post()
  add(@Param("teamId", ParseUUIDPipe) teamId: string, @Body() dto: CreateTeamMemberDto) {
    return this.teamMembersService.add(teamId, dto);
  }

  @Delete(":personId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Param("personId", ParseUUIDPipe) personId: string,
  ) {
    return this.teamMembersService.remove(teamId, personId);
  }
}
