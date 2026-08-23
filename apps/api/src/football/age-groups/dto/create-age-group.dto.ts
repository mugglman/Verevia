import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class CreateAgeGroupDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
