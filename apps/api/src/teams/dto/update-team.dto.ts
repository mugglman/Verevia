import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateTeamDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
