import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { CreateSeasonDto } from "./dto/create-season.dto";
import { ListSeasonsQueryDto } from "./dto/list-seasons-query.dto";
import { UpdateSeasonDto } from "./dto/update-season.dto";
import { SeasonsService } from "./seasons.service";

@Controller({ path: "seasons", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  list(@Query() query: ListSeasonsQueryDto) {
    return this.seasonsService.list(query);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.seasonsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateSeasonDto) {
    return this.seasonsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSeasonDto) {
    return this.seasonsService.update(id, dto);
  }
}
