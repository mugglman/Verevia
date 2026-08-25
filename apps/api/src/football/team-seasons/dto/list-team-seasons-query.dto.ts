import { IsOptional, IsUUID } from "class-validator";

export class ListTeamSeasonsQueryDto {
  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  ageGroupId?: string;
}
