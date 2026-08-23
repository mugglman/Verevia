import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../../tenant/tenant-context.interceptor";
import { CreateTeamSeasonDto } from "./dto/create-team-season.dto";
import { ListTeamSeasonsQueryDto } from "./dto/list-team-seasons-query.dto";
import { UpdateTeamSeasonDto } from "./dto/update-team-season.dto";
import { TeamSeasonsService } from "./team-seasons.service";

@Controller({ path: "football/team-seasons", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class TeamSeasonsController {
  constructor(private readonly teamSeasonsService: TeamSeasonsService) {}

  @Get()
  list(@Query() query: ListTeamSeasonsQueryDto) {
    return this.teamSeasonsService.list(query);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.teamSeasonsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateTeamSeasonDto) {
    return this.teamSeasonsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTeamSeasonDto) {
    return this.teamSeasonsService.update(id, dto);
  }
}
