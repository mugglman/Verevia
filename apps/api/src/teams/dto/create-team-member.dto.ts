import { IsUUID } from "class-validator";

export class CreateTeamMemberDto {
  @IsUUID()
  personId!: string;
}
