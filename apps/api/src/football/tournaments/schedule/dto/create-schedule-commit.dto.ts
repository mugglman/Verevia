import { IsString, MinLength } from "class-validator";
import { CreateSchedulePreviewDto } from "./create-schedule-preview.dto";

/**
 * Same settings as a preview, plus the fingerprint the client received
 * from the LAST preview call it saw — the server re-generates from fresh
 * DB state and its own recomputed fingerprint must match this one, or the
 * commit is rejected as stale (see TournamentScheduleService.commit and
 * PHASE_12 report, "Preview fingerprint").
 */
export class CreateScheduleCommitDto extends CreateSchedulePreviewDto {
  @IsString()
  @MinLength(1)
  fingerprint!: string;
}
