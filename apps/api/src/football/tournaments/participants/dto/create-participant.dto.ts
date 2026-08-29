import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateParticipantDto {
  @IsOptional()
  @IsUUID()
  teamSeasonId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  externalName?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  seed?: number;
}
