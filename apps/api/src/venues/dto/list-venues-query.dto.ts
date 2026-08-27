import { IsEnum, IsOptional } from "class-validator";
import { VenueStatus } from "@verevia/database";

export class ListVenuesQueryDto {
  @IsOptional()
  @IsEnum(VenueStatus)
  status?: VenueStatus;
}
