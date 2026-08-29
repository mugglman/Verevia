import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseInterceptors,
} from "@nestjs/common";
import { TenantContextInterceptor } from "../../../tenant/tenant-context.interceptor";
import { CreateParticipantDto } from "./dto/create-participant.dto";
import { UpdateParticipantDto } from "./dto/update-participant.dto";
import { ParticipantsService } from "./participants.service";

@Controller({ path: "football/tournaments/:tournamentId/participants", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  @Get()
  list(@Param("tournamentId", ParseUUIDPipe) tournamentId: string) {
    return this.participantsService.list(tournamentId);
  }

  @Post()
  create(@Param("tournamentId", ParseUUIDPipe) tournamentId: string, @Body() dto: CreateParticipantDto) {
    return this.participantsService.create(tournamentId, dto);
  }

  @Patch(":participantId")
  update(
    @Param("tournamentId", ParseUUIDPipe) tournamentId: string,
    @Param("participantId", ParseUUIDPipe) participantId: string,
    @Body() dto: UpdateParticipantDto,
  ) {
    return this.participantsService.update(tournamentId, participantId, dto);
  }

  @Delete(":participantId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("tournamentId", ParseUUIDPipe) tournamentId: string,
    @Param("participantId", ParseUUIDPipe) participantId: string,
  ) {
    return this.participantsService.remove(tournamentId, participantId);
  }
}
