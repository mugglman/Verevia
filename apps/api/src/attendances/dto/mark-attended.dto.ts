import { IsBoolean } from "class-validator";

export class MarkAttendedDto {
  @IsBoolean()
  attended!: boolean;
}
