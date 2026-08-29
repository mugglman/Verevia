import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../../tenant/tenant-context.interceptor";
import { CreateTournamentDto } from "./dto/create-tournament.dto";
import { ListTournamentsQueryDto } from "./dto/list-tournaments-query.dto";
import { UpdateTournamentDto } from "./dto/update-tournament.dto";
import { TournamentsService } from "./tournaments.service";

@Controller({ path: "football/tournaments", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get()
  list(@Query() query: ListTournamentsQueryDto) {
    return this.tournamentsService.list(query);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.tournamentsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateTournamentDto) {
    return this.tournamentsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTournamentDto) {
    return this.tournamentsService.update(id, dto);
  }
}
