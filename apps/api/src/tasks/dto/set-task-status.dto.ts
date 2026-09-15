import { IsEnum } from "class-validator";
import { TaskStatus } from "@verevia/database";

export class SetTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
