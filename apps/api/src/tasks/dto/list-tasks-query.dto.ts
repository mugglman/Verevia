import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { TaskStatus } from "@verevia/database";

export class ListTasksQueryDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
