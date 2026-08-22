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
import { CreateRelationshipDto } from "./dto/create-relationship.dto";
import { RelationshipsService } from "./relationships.service";

@Controller({ path: "persons/:personId/relationships", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class RelationshipsController {
  constructor(private readonly relationshipsService: RelationshipsService) {}

  @Get()
  list(@Param("personId", ParseUUIDPipe) personId: string) {
    return this.relationshipsService.list(personId);
  }

  @Post()
  create(@Param("personId", ParseUUIDPipe) personId: string, @Body() dto: CreateRelationshipDto) {
    return this.relationshipsService.create(personId, dto);
  }

  @Delete(":relationshipId")
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param("personId", ParseUUIDPipe) personId: string,
    @Param("relationshipId", ParseUUIDPipe) relationshipId: string,
  ) {
    return this.relationshipsService.revoke(personId, relationshipId);
  }
}
