import { IsDateString, IsEnum, IsOptional, IsUUID } from "class-validator";
import { MatchStatus, MatchType } from "@verevia/database";

export class ListMatchesQueryDto {
  @IsOptional()
  @IsUUID()
  teamSeasonId?: string;

  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;

  @IsOptional()
  @IsEnum(MatchType)
  type?: MatchType;
}
