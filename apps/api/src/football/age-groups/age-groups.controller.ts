import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../../tenant/tenant-context.interceptor";
import { AgeGroupsService } from "./age-groups.service";
import { CreateAgeGroupDto } from "./dto/create-age-group.dto";
import { UpdateAgeGroupDto } from "./dto/update-age-group.dto";

@Controller({ path: "football/age-groups", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class AgeGroupsController {
  constructor(private readonly ageGroupsService: AgeGroupsService) {}

  @Get()
  list() {
    return this.ageGroupsService.list();
  }

  @Post()
  create(@Body() dto: CreateAgeGroupDto) {
    return this.ageGroupsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAgeGroupDto) {
    return this.ageGroupsService.update(id, dto);
  }
}
