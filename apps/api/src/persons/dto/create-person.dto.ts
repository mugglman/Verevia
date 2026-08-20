import { IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Datensparsam per Phase 4, section 12: nur Vor-/Nachname sind
 * verpflichtend. `birthDate`/`contactEmail`/`contactPhone` existieren
 * bereits im akzeptierten Person-Modell (Phase 2) und dürfen optional
 * verwendet werden — keine neuen sensiblen Felder (keine medizinischen
 * Daten, keine Adress-/Ausweisdaten) hinzugefügt.
 */
export class CreatePersonDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;
}
