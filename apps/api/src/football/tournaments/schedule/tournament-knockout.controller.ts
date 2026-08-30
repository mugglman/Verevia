import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseInterceptors } from "@nestjs/common";
import { TenantContextInterceptor } from "../../../tenant/tenant-context.interceptor";
import { CreateKnockoutCommitDto } from "./dto/create-knockout-commit.dto";
import { CreateKnockoutPreviewDto } from "./dto/create-knockout-preview.dto";
import { TournamentKnockoutService } from "./tournament-knockout.service";

/**
 * Preview/commit routes for the automatic knockout/final-round bracket
 * generator (Phase 13) — deliberately separate from
 * `/schedule/preview`/`/schedule/commit` (Phase 12's round-robin group
 * stage) rather than one generic endpoint: the two response shapes differ
 * substantially (a flat fixture list vs. a bracket with dependency
 * structure), and a single tournament may only ever commit ONE schedule in
 * total (see TournamentKnockoutService.commit) — so there's no scenario
 * where a client needs both behind one shared contract. Same
 * preview-never-writes / commit-atomically-or-not-at-all split as Phase 12.
 */
@Controller({ path: "football/tournaments/:tournamentId/knockout", version: "1" })
@UseInterceptors(TenantContextInterceptor)
export class TournamentKnockoutController {
  constructor(private readonly knockoutService: TournamentKnockoutService) {}

  // 200, not the NestJS-default 201 for POST — a preview creates nothing
  // (see Phase 12's identical fix for the round-robin preview endpoint).
  @Post("preview")
  @HttpCode(HttpStatus.OK)
  preview(@Param("tournamentId", ParseUUIDPipe) tournamentId: string, @Body() dto: CreateKnockoutPreviewDto) {
    return this.knockoutService.preview(tournamentId, dto);
  }

  @Post("commit")
  commit(@Param("tournamentId", ParseUUIDPipe) tournamentId: string, @Body() dto: CreateKnockoutCommitDto) {
    return this.knockoutService.commit(tournamentId, dto);
  }
}
