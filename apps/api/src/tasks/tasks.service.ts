import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { TaskStatus, getTenantContext, getTenantPrisma } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRelationshipsAuthService } from "../authorization/person-relationships-auth.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { ListTasksQueryDto } from "./dto/list-tasks-query.dto";
import { SetTaskStatusDto } from "./dto/set-task-status.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";

/**
 * Aufgabe (Phase 20) — siehe docs/database/Database.md, Entität "Task
 * (Aufgabe)", und das Modellkommentar an `Task` im Prisma-Schema für die
 * Autorisierungs-Begründung (Team-Scope folgt canOnMatch, Person-Scope
 * leitet die Berechtigung aus der Zielperson-Mannschaftszugehörigkeit ab,
 * siehe ADR 0016).
 */
export interface TaskDto {
  id: string;
  teamId: string | null;
  teamName: string | null;
  personId: string | null;
  personName: string | null;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: TaskStatus;
  canEdit: boolean;
  canSetStatus: boolean;
}

export interface TaskListResponse {
  items: TaskDto[];
  /**
   * Whether the caller can create a task for AT LEAST ONE team/person
   * (create permission is context-dependent, see `canAccess` below) — used
   * by the web UI to show/hide the "Aufgabe anlegen" link, same pattern as
   * `EventListResponse.canCreate` (Phase 18).
   */
  canCreate: boolean;
}

const TASK_INCLUDE = {
  team: { select: { name: true, departmentId: true } },
  person: { select: { firstName: true, lastName: true } },
} as const;

type TaskWithRelations = {
  id: string;
  teamId: string | null;
  personId: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  status: TaskStatus;
  team: { name: string; departmentId: string } | null;
  person: { firstName: string; lastName: string } | null;
};

type Assignments = Awaited<ReturnType<PersonRoleAssignmentsService["load"]>>;

@Injectable()
export class TasksService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly roleAssignments: PersonRoleAssignmentsService,
    private readonly relationshipsAuth: PersonRelationshipsAuthService,
  ) {}

  private requireContext() {
    const context = getTenantContext();
    if (!context?.personId) {
      throw new UnauthorizedException("No active tenant context");
    }
    return context;
  }

  private toDto(task: TaskWithRelations, canEdit: boolean, canSetStatus: boolean): TaskDto {
    return {
      id: task.id,
      teamId: task.teamId,
      teamName: task.team?.name ?? null,
      personId: task.personId,
      personName: task.person ? `${task.person.firstName} ${task.person.lastName}` : null,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt?.toISOString() ?? null,
      status: task.status,
      canEdit,
      canSetStatus,
    };
  }

  /** Active teams (with their department) a person currently belongs to, via TeamMember — see ADR 0016. */
  private async resolveTargetPersonTeams(
    tenantId: string,
    personId: string,
  ): Promise<Array<{ teamId: string; departmentId: string }>> {
    const db = getTenantPrisma(tenantId);
    const memberships = await db.teamMember.findMany({
      where: { personId, status: "ACTIVE" },
      select: { team: { select: { id: true, departmentId: true } } },
    });
    return memberships.map((m) => ({ teamId: m.team.id, departmentId: m.team.departmentId }));
  }

  /**
   * Person-scoped task authorization (ADR 0016): the caller may act if they
   * manage AT LEAST ONE of the target person's current teams (same
   * canOnMatch rule as a team-scoped task/match) — or are TENANT_ADMIN,
   * which canOnMatch already grants even with an empty context.
   */
  private canAccessPersonTask(
    assignments: Assignments,
    targetTeams: Array<{ teamId: string; departmentId: string }>,
    action: "read" | "create" | "update",
  ): boolean {
    if (targetTeams.length === 0) {
      return this.authz.canOnMatch(assignments, action, {});
    }
    return targetTeams.some((t) => this.authz.canOnMatch(assignments, action, { teamId: t.teamId, departmentId: t.departmentId }));
  }

  private async canAccess(
    tenantId: string,
    assignments: Assignments,
    task: { teamId: string | null; personId: string | null; team: { departmentId: string } | null },
    action: "read" | "create" | "update",
  ): Promise<boolean> {
    if (task.teamId) {
      return this.authz.canOnMatch(assignments, action, { teamId: task.teamId, departmentId: task.team!.departmentId });
    }
    const targetTeams = await this.resolveTargetPersonTeams(tenantId, task.personId!);
    return this.canAccessPersonTask(assignments, targetTeams, action);
  }

  /**
   * Self-service: the task's own assignee, or their verified guardian, may
   * always set the status — independent of any RoleAssignment (mirrors the
   * same real-world gap already reasoned about in ADR 0016: an ordinary
   * player/child often has no RoleAssignment at all, only a TeamMember row).
   * Team-scoped tasks have no single assignee — organizer-only.
   */
  private async isSelfOrGuardianOfAssignee(tenantId: string, callerPersonId: string, task: { personId: string | null }): Promise<boolean> {
    if (!task.personId) return false;
    if (task.personId === callerPersonId) return true;
    const relationships = await this.relationshipsAuth.loadAsGuardian(tenantId, callerPersonId);
    return this.authz.getGuardianChildPersonIds(relationships).includes(task.personId);
  }

  /**
   * Teams/persons the caller may actually create a task for — powers the
   * web create form's "Für wen"-select, same reasoning as
   * `EventsService.listCreatableScopes` (ADR 0014): offering only choices
   * that will succeed on submit.
   */
  async listCreatableScopes(): Promise<{ teams: Array<{ id: string; name: string }>; persons: Array<{ id: string; name: string }> }> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);

    const teams = await db.team.findMany({ select: { id: true, name: true, departmentId: true }, orderBy: { name: "asc" } });
    const creatableTeams = teams.filter((t) => this.authz.canOnMatch(assignments, "create", { teamId: t.id, departmentId: t.departmentId }));

    let persons: Array<{ id: string; name: string }>;
    if (assignments.some((ra) => ra.role === "TENANT_ADMIN" && ra.scopeType === "TENANT")) {
      const allPersons = await db.person.findMany({ select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
      persons = allPersons.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }));
    } else {
      const teamIds = creatableTeams.map((t) => t.id);
      const members = teamIds.length
        ? await db.teamMember.findMany({
            where: { teamId: { in: teamIds }, status: "ACTIVE" },
            select: { personId: true, person: { select: { firstName: true, lastName: true } } },
          })
        : [];
      const byPersonId = new Map<string, { id: string; name: string }>();
      for (const m of members) {
        byPersonId.set(m.personId, { id: m.personId, name: `${m.person.firstName} ${m.person.lastName}` });
      }
      persons = [...byPersonId.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
    }

    return {
      teams: creatableTeams.map((t) => ({ id: t.id, name: t.name })),
      persons,
    };
  }

  async list(query: ListTasksQueryDto): Promise<TaskListResponse> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const tasks = await db.task.findMany({
      where: { teamId: query.teamId, personId: query.personId, status: query.status },
      include: TASK_INCLUDE,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }],
    });

    const items: TaskDto[] = [];
    for (const task of tasks) {
      const canRead = await this.canAccess(context.tenantId, assignments, task, "read");
      if (!canRead) continue;
      const canEdit = await this.canAccess(context.tenantId, assignments, task, "update");
      const canSetStatus = canEdit || (await this.isSelfOrGuardianOfAssignee(context.tenantId, context.personId!, task));
      items.push(this.toDto(task, canEdit, canSetStatus));
    }

    return {
      items,
      canCreate: assignments.some(
        (ra) => ra.role === "TENANT_ADMIN" || ra.role === "DEPARTMENT_ADMIN" || ra.role === "COACH" || ra.role === "TEAM_MANAGER",
      ),
    };
  }

  async getById(id: string): Promise<TaskDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const task = await db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const canRead = await this.canAccess(context.tenantId, assignments, task, "read");
    const canEdit = await this.canAccess(context.tenantId, assignments, task, "update");
    const canSetStatus = canEdit || (await this.isSelfOrGuardianOfAssignee(context.tenantId, context.personId!, task));
    if (!canRead && !canSetStatus) {
      throw new ForbiddenException("Not permitted to read this task");
    }
    return this.toDto(task, canEdit, canSetStatus);
  }

  async create(dto: CreateTaskDto): Promise<TaskDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);

    if ((dto.teamId && dto.personId) || (!dto.teamId && !dto.personId)) {
      throw new BadRequestException("A task needs exactly one of teamId or personId");
    }

    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);

    let teamDepartmentId: string | undefined;
    if (dto.teamId) {
      const team = await db.team.findUnique({ where: { id: dto.teamId }, select: { departmentId: true } });
      if (!team) {
        throw new NotFoundException("Team not found");
      }
      teamDepartmentId = team.departmentId;
      if (!this.authz.canOnMatch(assignments, "create", { teamId: dto.teamId, departmentId: teamDepartmentId })) {
        throw new ForbiddenException("Not permitted to create a task for this team");
      }
    } else {
      const person = await db.person.findUnique({ where: { id: dto.personId! } });
      if (!person) {
        throw new NotFoundException("Person not found");
      }
      const targetTeams = await this.resolveTargetPersonTeams(context.tenantId, dto.personId!);
      if (!this.canAccessPersonTask(assignments, targetTeams, "create")) {
        throw new ForbiddenException("Not permitted to create a task for this person");
      }
    }

    const task = await db.task.create({
      data: {
        tenantId: context.tenantId,
        teamId: dto.teamId,
        personId: dto.personId,
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: TASK_INCLUDE,
    });
    return this.toDto(task, true, true);
  }

  async update(id: string, dto: UpdateTaskDto): Promise<TaskDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!existing) {
      throw new NotFoundException("Task not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!(await this.canAccess(context.tenantId, assignments, existing, "update"))) {
      throw new ForbiddenException("Not permitted to update this task");
    }

    const task = await db.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: TASK_INCLUDE,
    });
    return this.toDto(task, true, true);
  }

  async setStatus(id: string, dto: SetTaskStatusDto): Promise<TaskDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!existing) {
      throw new NotFoundException("Task not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const canManage = await this.canAccess(context.tenantId, assignments, existing, "update");
    const canSelf = await this.isSelfOrGuardianOfAssignee(context.tenantId, context.personId!, existing);
    if (!canManage && !canSelf) {
      throw new ForbiddenException("Not permitted to set the status of this task");
    }

    const task = await db.task.update({ where: { id }, data: { status: dto.status }, include: TASK_INCLUDE });
    return this.toDto(task, canManage, true);
  }

  async remove(id: string): Promise<void> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!existing) {
      throw new NotFoundException("Task not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!(await this.canAccess(context.tenantId, assignments, existing, "update"))) {
      throw new ForbiddenException("Not permitted to delete this task");
    }
    await db.task.delete({ where: { id } });
  }
}
