import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from "@nestjs/common";
import { TenantContextInterceptor } from "../tenant/tenant-context.interceptor";
import { GrantRoleDto } from "./dto/grant-role.dto";
import { PersonRolesService } from "./person-roles.service";

@Controller({ path: "persons/:personId/roles", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class PersonRolesController {
  constructor(private readonly personRolesService: PersonRolesService) {}

  @Get()
  list(@Param("personId", ParseUUIDPipe) personId: string) {
    return this.personRolesService.list(personId);
  }

  @Post()
  grant(@Param("personId", ParseUUIDPipe) personId: string, @Body() dto: GrantRoleDto) {
    return this.personRolesService.grant(personId, dto);
  }

  @Delete(":roleAssignmentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param("personId", ParseUUIDPipe) personId: string,
    @Param("roleAssignmentId", ParseUUIDPipe) roleAssignmentId: string,
  ) {
    return this.personRolesService.revoke(personId, roleAssignmentId);
  }
}
