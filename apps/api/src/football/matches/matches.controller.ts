import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../../tenant/tenant-context.interceptor";
import { CreateMatchDto } from "./dto/create-match.dto";
import { ListMatchesQueryDto } from "./dto/list-matches-query.dto";
import { UpdateMatchDto } from "./dto/update-match.dto";
import { MatchesService } from "./matches.service";

@Controller({ path: "football/matches", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  list(@Query() query: ListMatchesQueryDto) {
    return this.matchesService.list(query);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.matchesService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateMatchDto) {
    return this.matchesService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateMatchDto) {
    return this.matchesService.update(id, dto);
  }
}
