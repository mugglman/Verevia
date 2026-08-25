import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { TeamSeasonStatus } from "@verevia/database";

export class CreateTeamSeasonDto {
  @IsUUID()
  teamId!: string;

  @IsUUID()
  seasonId!: string;

  @IsUUID()
  ageGroupId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsEnum(TeamSeasonStatus)
  status?: TeamSeasonStatus;
}
