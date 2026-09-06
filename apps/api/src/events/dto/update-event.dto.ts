import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { EventType } from "@verevia/database";

/**
 * Deliberately no teamId/departmentId here — an event's scope is fixed at
 * creation (same immutable-mode-after-create convention as
 * FootballMatch's club-vs-tournament mode, ADR 0008): moving an event
 * between a team and a department would need its own re-authorization
 * story that isn't part of this phase.
 */
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @IsOptional()
  @IsUUID()
  venueId?: string;
}
