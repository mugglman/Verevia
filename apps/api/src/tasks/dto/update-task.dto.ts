import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Deliberately no teamId/personId here — a task's assignee is fixed at
 * creation (same immutable-scope-after-create convention as UpdateEventDto,
 * Phase 18): reassigning a task would need its own re-authorization story
 * that isn't part of this phase.
 */
export class UpdateTaskDto {
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
  @IsDateString()
  dueAt?: string;
}
