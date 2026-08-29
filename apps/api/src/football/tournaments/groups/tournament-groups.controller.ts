import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../../../tenant/tenant-context.interceptor";
import { CreateTournamentGroupDto } from "./dto/create-tournament-group.dto";
import { UpdateTournamentGroupDto } from "./dto/update-tournament-group.dto";
import { TournamentGroupsService } from "./tournament-groups.service";

@Controller({ path: "football/tournaments/:tournamentId/groups", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class TournamentGroupsController {
  constructor(private readonly tournamentGroupsService: TournamentGroupsService) {}

  @Get()
  list(@Param("tournamentId", ParseUUIDPipe) tournamentId: string) {
    return this.tournamentGroupsService.list(tournamentId);
  }

  @Post()
  create(@Param("tournamentId", ParseUUIDPipe) tournamentId: string, @Body() dto: CreateTournamentGroupDto) {
    return this.tournamentGroupsService.create(tournamentId, dto);
  }

  @Patch(":groupId")
  update(
    @Param("tournamentId", ParseUUIDPipe) tournamentId: string,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateTournamentGroupDto,
  ) {
    return this.tournamentGroupsService.update(tournamentId, groupId, dto);
  }
}
