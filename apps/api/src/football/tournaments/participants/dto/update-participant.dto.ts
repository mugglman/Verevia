import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { ParticipantStatus } from "@verevia/database";

export class UpdateParticipantDto {
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  seed?: number;

  @IsOptional()
  @IsEnum(ParticipantStatus)
  status?: ParticipantStatus;
}
