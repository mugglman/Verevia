import { IsEnum, IsUUID } from "class-validator";
import { RelationshipType } from "@verevia/database";

export class CreateRelationshipDto {
  @IsUUID()
  toPersonId!: string;

  @IsEnum(RelationshipType)
  type!: RelationshipType;
}
