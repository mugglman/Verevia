import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class CreateTournamentVenueDto {
  @IsUUID()
  venueId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
