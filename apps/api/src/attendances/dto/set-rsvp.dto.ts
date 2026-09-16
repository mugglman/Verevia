import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { RsvpStatus } from "@verevia/database";

export class SetRsvpDto {
  @IsEnum(RsvpStatus)
  status!: RsvpStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
