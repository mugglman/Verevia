import { IsOptional, IsUUID } from "class-validator";

export class ListSeasonsQueryDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
