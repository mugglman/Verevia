import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { EventType } from "@verevia/database";

/**
 * A team-scoped or department-scoped event — never both, never neither
 * (see Event's model comment / event_scope_xor). Which fields are
 * actually required (exactly one of teamId/departmentId) is validated in
 * EventsService, not here — mirrors CreateMatchDto (Phase 10), where
 * cross-field business rules also live in the service.
 */
export class CreateEventDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}
