import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";
import { MatchHomeAway, MatchStatus, MatchType } from "@verevia/database";

/**
 * Supports two mutually exclusive modes (see ADR 0008):
 * - Club match: teamSeasonId + opponentName.
 * - Tournament match: tournamentId + homeParticipantId + awayParticipantId
 *   (optionally tournamentGroupId). type is forced to TOURNAMENT server-side
 *   in this mode regardless of what is sent here.
 * Which fields are actually required is validated in MatchesService, not
 * here, since the requirement depends on which mode is being used.
 */
export class CreateMatchDto {
  @IsOptional()
  @IsUUID()
  teamSeasonId?: string;

  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsDateString()
  startsAt!: string;

  @IsEnum(MatchType)
  type!: MatchType;

  @IsEnum(MatchHomeAway)
  homeAway!: MatchHomeAway;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  opponentName?: string;

  @IsOptional()
  @IsUUID()
  tournamentId?: string;

  @IsOptional()
  @IsUUID()
  tournamentGroupId?: string;

  @IsOptional()
  @IsUUID()
  homeParticipantId?: string;

  @IsOptional()
  @IsUUID()
  awayParticipantId?: string;

  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  homeScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  awayScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
