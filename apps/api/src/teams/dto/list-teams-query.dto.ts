import { IsOptional, IsUUID } from "class-validator";

export class ListTeamsQueryDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
