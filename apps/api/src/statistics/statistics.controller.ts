import { Controller, Get, Param, ParseUUIDPipe, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { StatisticsService } from "./statistics.service";

@Controller({ path: "statistics/team-seasons", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get(":teamSeasonId")
  getTeamSeasonStatistics(@Param("teamSeasonId", ParseUUIDPipe) teamSeasonId: string) {
    return this.statisticsService.getTeamSeasonStatistics(teamSeasonId);
  }
}
