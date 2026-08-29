import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateTournamentGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  displayOrder?: number;
}
