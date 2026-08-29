import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../../../tenant/tenant-context.interceptor";
import { CreateMatchDto } from "../../matches/dto/create-match.dto";
import { MatchesService } from "../../matches/matches.service";

/**
 * Thin convenience routes over the shared MatchesService (see ADR 0008) —
 * no separate tournament-match business logic. GET filters matches by
 * tournamentId; POST forces tournamentId onto the body so callers don't
 * have to repeat it.
 */
@Controller({ path: "football/tournaments/:tournamentId/matches", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class TournamentMatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  list(@Param("tournamentId", ParseUUIDPipe) tournamentId: string) {
    return this.matchesService.list({ tournamentId });
  }

  @Post()
  create(@Param("tournamentId", ParseUUIDPipe) tournamentId: string, @Body() dto: CreateMatchDto) {
    return this.matchesService.create({ ...dto, tournamentId });
  }
}
