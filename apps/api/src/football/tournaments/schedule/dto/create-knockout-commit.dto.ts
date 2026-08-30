import { IsString, MinLength } from "class-validator";
import { CreateKnockoutPreviewDto } from "./create-knockout-preview.dto";

/**
 * Same configuration as a preview, plus the fingerprint the client received
 * from the LAST preview call it saw — mirrors CreateScheduleCommitDto from
 * Phase 12, see TournamentKnockoutService.commit.
 */
export class CreateKnockoutCommitDto extends CreateKnockoutPreviewDto {
  @IsString()
  @MinLength(1)
  fingerprint!: string;
}
