import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Only `name` is editable — the only field on `Tenant` that makes sense as
 * self-service club data (`slug`/`status` are administrative, not exposed
 * here). No fields invented beyond what already exists on the model.
 */
export class UpdateClubDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
