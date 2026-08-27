import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { ListVenuesQueryDto } from "./dto/list-venues-query.dto";
import { UpdateVenueDto } from "./dto/update-venue.dto";
import { VenuesService } from "./venues.service";

@Controller({ path: "venues", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  list(@Query() query: ListVenuesQueryDto) {
    return this.venuesService.list(query);
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.venuesService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateVenueDto) {
    return this.venuesService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateVenueDto) {
    return this.venuesService.update(id, dto);
  }
}
