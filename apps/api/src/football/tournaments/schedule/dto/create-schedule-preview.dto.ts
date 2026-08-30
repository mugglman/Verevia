import { ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { SCHEDULE_SETTINGS_LIMITS } from "../generator/limits";

/**
 * Settings for a schedule generation attempt — sent by the client on both
 * preview and commit (the commit body extends this, see
 * CreateScheduleCommitDto). Deliberately not backed by a persisted DB
 * config (see PHASE_12 report, "Domain model decision") — the client
 * echoes the same settings it wants used, and the server always
 * regenerates from these plus the current DB state.
 */
export class CreateSchedulePreviewDto {
  @IsInt()
  @Min(SCHEDULE_SETTINGS_LIMITS.minMatchDurationMinutes)
  @Max(SCHEDULE_SETTINGS_LIMITS.maxMatchDurationMinutes)
  matchDurationMinutes!: number;

  @IsInt()
  @Min(SCHEDULE_SETTINGS_LIMITS.minChangeoverMinutes)
  @Max(SCHEDULE_SETTINGS_LIMITS.maxChangeoverMinutes)
  changeoverMinutes!: number;

  @IsInt()
  @Min(SCHEDULE_SETTINGS_LIMITS.minMinimumRestMinutes)
  @Max(SCHEDULE_SETTINGS_LIMITS.maxMinimumRestMinutes)
  minimumRestMinutes!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  venueIds!: string[];

  /** Optional override for the scheduling start — defaults to the tournament's own startsAt if omitted. */
  @IsOptional()
  @IsDateString()
  schedulingStartsAt?: string;
}
