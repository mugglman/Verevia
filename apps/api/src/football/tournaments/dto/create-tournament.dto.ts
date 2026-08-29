import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { TournamentMode, TournamentStatus } from "@verevia/database";

export class CreateTournamentDto {
  @IsUUID()
  departmentId!: string;

  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @IsOptional()
  @IsEnum(TournamentMode)
  mode?: TournamentMode;
}
