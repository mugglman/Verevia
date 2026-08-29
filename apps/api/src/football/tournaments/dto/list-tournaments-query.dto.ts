import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { TournamentStatus } from "@verevia/database";

export class ListTournamentsQueryDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;
}
