import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

/**
 * A team-scoped or person-scoped task — never both, never neither (see
 * Task's model comment / task_assignee_xor). Which fields are actually
 * required (exactly one of teamId/personId) is validated in TasksService,
 * not here — mirrors CreateEventDto (Phase 18).
 */
export class CreateTaskDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
