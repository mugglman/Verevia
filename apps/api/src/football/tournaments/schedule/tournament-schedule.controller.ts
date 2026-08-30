import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../../../tenant/tenant-context.interceptor";
import { CreateScheduleCommitDto } from "./dto/create-schedule-commit.dto";
import { CreateSchedulePreviewDto } from "./dto/create-schedule-preview.dto";
import { TournamentScheduleService } from "./tournament-schedule.service";

/**
 * Preview/commit routes for the automatic tournament schedule generator
 * (Phase 12). Preview never writes to the database; commit persists
 * exactly the previewed matches, atomically, only if the tournament state
 * hasn't changed since — see TournamentScheduleService.
 */
@Controller({ path: "football/tournaments/:tournamentId/schedule", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class TournamentScheduleController {
  constructor(private readonly scheduleService: TournamentScheduleService) {}

  // 200, not the NestJS-default 201 for POST — a preview creates nothing.
  @Post("preview")
  @HttpCode(HttpStatus.OK)
  preview(@Param("tournamentId", ParseUUIDPipe) tournamentId: string, @Body() dto: CreateSchedulePreviewDto) {
    return this.scheduleService.preview(tournamentId, dto);
  }

  @Post("commit")
  commit(@Param("tournamentId", ParseUUIDPipe) tournamentId: string, @Body() dto: CreateScheduleCommitDto) {
    return this.scheduleService.commit(tournamentId, dto);
  }
}
