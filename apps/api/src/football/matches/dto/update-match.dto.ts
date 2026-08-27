import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";
import { MatchHomeAway, MatchStatus, MatchType } from "@verevia/database";

export class UpdateMatchDto {
  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsEnum(MatchType)
  type?: MatchType;

  @IsOptional()
  @IsEnum(MatchHomeAway)
  homeAway?: MatchHomeAway;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  opponentName?: string;

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
