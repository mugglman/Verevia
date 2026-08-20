import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { CreatePersonDto } from "./dto/create-person.dto";
import { UpdatePersonDto } from "./dto/update-person.dto";
import { PersonsService } from "./persons.service";

@Controller({ path: "persons", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get()
  list() {
    return this.personsService.list();
  }

  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.personsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreatePersonDto) {
    return this.personsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdatePersonDto) {
    return this.personsService.update(id, dto);
  }
}
