import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";
import { MatchHomeAway, MatchStatus, MatchType } from "@verevia/database";

export class CreateMatchDto {
  @IsUUID()
  teamSeasonId!: string;

  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsDateString()
  startsAt!: string;

  @IsEnum(MatchType)
  type!: MatchType;

  @IsEnum(MatchHomeAway)
  homeAway!: MatchHomeAway;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  opponentName!: string;

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
