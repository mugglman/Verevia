import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../../../tenant/tenant-context.interceptor";
import { CreateTournamentVenueDto } from "./dto/create-tournament-venue.dto";
import { TournamentVenuesService } from "./tournament-venues.service";

@Controller({ path: "football/tournaments/:tournamentId/venues", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class TournamentVenuesController {
  constructor(private readonly tournamentVenuesService: TournamentVenuesService) {}

  @Get()
  list(@Param("tournamentId", ParseUUIDPipe) tournamentId: string) {
    return this.tournamentVenuesService.list(tournamentId);
  }

  @Post()
  create(@Param("tournamentId", ParseUUIDPipe) tournamentId: string, @Body() dto: CreateTournamentVenueDto) {
    return this.tournamentVenuesService.create(tournamentId, dto);
  }

  @Delete(":venueId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("tournamentId", ParseUUIDPipe) tournamentId: string,
    @Param("venueId", ParseUUIDPipe) venueId: string,
  ) {
    return this.tournamentVenuesService.remove(tournamentId, venueId);
  }
}
