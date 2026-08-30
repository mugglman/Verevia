import { Type } from "class-transformer";
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from "class-validator";
import { SCHEDULE_SETTINGS_LIMITS } from "../generator/limits";
import { KnockoutEntrantDto } from "./knockout-entrant.dto";

/**
 * Settings for a knockout bracket generation attempt — sent by the client
 * on both preview and commit (mirrors CreateSchedulePreviewDto's role from
 * Phase 12; same "no persisted config" decision, see PHASE_13 report).
 */
export class CreateKnockoutPreviewDto {
  @IsArray()
  @ArrayMinSize(2)
  @Type(() => KnockoutEntrantDto)
  @ValidateNested({ each: true })
  entrants!: KnockoutEntrantDto[];

  @IsBoolean()
  includeThirdPlace!: boolean;

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
