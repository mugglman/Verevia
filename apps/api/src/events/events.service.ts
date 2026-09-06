import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { EventType, getTenantContext, getTenantPrisma } from "@verevia/database";
import { AuthorizationService } from "../authorization/authorization.service";
import { PersonRoleAssignmentsService } from "../authorization/person-role-assignments.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { ListEventsQueryDto } from "./dto/list-events-query.dto";
import { UpdateEventDto } from "./dto/update-event.dto";

/**
 * Kalendereintrag (Phase 18) — siehe docs/database/Database.md, Entität
 * "Event (Termin)", und das Modellkommentar an `Event` im Prisma-Schema
 * für die Autorisierungs-Begründung (team-gebunden folgt canOnMatch,
 * department-gebunden folgt canOnSeason).
 */
export interface EventDto {
  id: string;
  departmentId: string | null;
  departmentName: string | null;
  teamId: string | null;
  teamName: string | null;
  seasonId: string | null;
  seasonName: string | null;
  venueId: string | null;
  venueName: string | null;
  title: string;
  description: string | null;
  type: EventType;
  startsAt: string;
  endsAt: string;
  canEdit: boolean;
}

export interface EventListResponse {
  items: EventDto[];
  /**
   * Whether the caller can create an event for AT LEAST ONE team/department
   * (create permission is context-dependent, see `canAccess` below) — used
   * by the web UI to show/hide the "Termin anlegen" link, same pattern as
   * `VenueListResponse.canCreate`.
   */
  canCreate: boolean;
}

const EVENT_INCLUDE = {
  department: { select: { name: true } },
  team: { select: { name: true, departmentId: true } },
  season: { select: { name: true } },
  venue: { select: { name: true } },
} as const;

type EventWithRelations = {
  id: string;
  departmentId: string | null;
  teamId: string | null;
  seasonId: string | null;
  venueId: string | null;
  title: string;
  description: string | null;
  type: EventType;
  startsAt: Date;
  endsAt: Date;
  department: { name: string } | null;
  team: { name: string; departmentId: string } | null;
  season: { name: string } | null;
  venue: { name: string } | null;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly roleAssignments: PersonRoleAssignmentsService,
  ) {}

  private requireContext() {
    const context = getTenantContext();
    if (!context?.personId) {
      throw new UnauthorizedException("No active tenant context");
    }
    return context;
  }

  private toDto(event: EventWithRelations, canEdit: boolean): EventDto {
    return {
      id: event.id,
      departmentId: event.departmentId,
      departmentName: event.department?.name ?? null,
      teamId: event.teamId,
      teamName: event.team?.name ?? null,
      seasonId: event.seasonId,
      seasonName: event.season?.name ?? null,
      venueId: event.venueId,
      venueName: event.venue?.name ?? null,
      title: event.title,
      description: event.description,
      type: event.type,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      canEdit,
    };
  }

  /**
   * Team-scoped events are a day-to-day coach task (same reasoning as
   * FootballMatch, see Roles-and-Permissions.md's Phase-10 addendum) —
   * authorized via `canOnMatch`. Department-scoped events (e.g. a
   * department-wide meeting) are more administrative — authorized via
   * `canOnSeason`, same as Season/FootballTournament.
   */
  private canAccess(
    assignments: Awaited<ReturnType<PersonRoleAssignmentsService["load"]>>,
    event: { teamId: string | null; departmentId: string | null; team: { departmentId: string } | null },
    action: "read" | "create" | "update",
  ): boolean {
    if (event.teamId) {
      return this.authz.canOnMatch(assignments, action, {
        teamId: event.teamId,
        departmentId: event.team!.departmentId,
      });
    }
    return this.authz.canOnSeason(assignments, action, event.departmentId!);
  }

  /**
   * Teams/departments the caller may actually create an event for —
   * powers the web create form's "Für wen"-select so it only offers
   * choices that will succeed on submit, instead of every team/department
   * the caller can merely READ (which would include e.g. a PLAYER's own
   * team or a department they have no write role in). A dedicated
   * endpoint rather than overloading `TeamDto.canEdit`/`DepartmentDto`:
   * those reflect `canOnTeam`/tenant-admin-only semantics, not the
   * `canOnMatch` day-to-day-coach-task rule events actually use.
   */
  async listCreatableScopes(): Promise<{ teams: Array<{ id: string; name: string }>; departments: Array<{ id: string; name: string }> }> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const [teams, departments] = await Promise.all([
      db.team.findMany({ select: { id: true, name: true, departmentId: true }, orderBy: { name: "asc" } }),
      db.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return {
      teams: teams
        .filter((t) => this.canAccess(assignments, { teamId: t.id, departmentId: null, team: { departmentId: t.departmentId } }, "create"))
        .map((t) => ({ id: t.id, name: t.name })),
      departments: departments
        .filter((d) => this.canAccess(assignments, { teamId: null, departmentId: d.id, team: null }, "create"))
        .map((d) => ({ id: d.id, name: d.name })),
    };
  }

  private assertValidDateRange(startsAt: string, endsAt: string) {
    if (new Date(endsAt) < new Date(startsAt)) {
      throw new BadRequestException("endsAt must not be before startsAt");
    }
  }

  async list(query: ListEventsQueryDto): Promise<EventListResponse> {
    const context = this.requireContext();
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    const db = getTenantPrisma(context.tenantId);
    const events = await db.event.findMany({
      where: {
        teamId: query.teamId,
        departmentId: query.departmentId,
        seasonId: query.seasonId,
        startsAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
      },
      include: EVENT_INCLUDE,
      orderBy: { startsAt: "asc" },
    });
    return {
      items: events
        .filter((e) => this.canAccess(assignments, e, "read"))
        .map((e) => this.toDto(e, this.canAccess(assignments, e, "update"))),
      // Same roles canAccess("create") grants for at least one team/
      // department: TENANT_ADMIN always; DEPARTMENT_ADMIN/COACH/
      // TEAM_MANAGER somewhere implies "yes, for their own scope".
      canCreate: assignments.some(
        (ra) => ra.role === "TENANT_ADMIN" || ra.role === "DEPARTMENT_ADMIN" || ra.role === "COACH" || ra.role === "TEAM_MANAGER",
      ),
    };
  }

  async getById(id: string): Promise<EventDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const event = await db.event.findUnique({ where: { id }, include: EVENT_INCLUDE });
    if (!event) {
      throw new NotFoundException("Event not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.canAccess(assignments, event, "read")) {
      throw new ForbiddenException("Not permitted to read this event");
    }
    return this.toDto(event, this.canAccess(assignments, event, "update"));
  }

  async create(dto: CreateEventDto): Promise<EventDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);

    if ((dto.teamId && dto.departmentId) || (!dto.teamId && !dto.departmentId)) {
      throw new BadRequestException("An event needs exactly one of teamId or departmentId");
    }
    this.assertValidDateRange(dto.startsAt, dto.endsAt);

    let resolvedDepartmentId: string;
    if (dto.teamId) {
      const team = await db.team.findUnique({ where: { id: dto.teamId }, select: { departmentId: true } });
      if (!team) {
        throw new NotFoundException("Team not found");
      }
      resolvedDepartmentId = team.departmentId;
    } else {
      const department = await db.department.findUnique({ where: { id: dto.departmentId! } });
      if (!department) {
        throw new NotFoundException("Department not found");
      }
      resolvedDepartmentId = department.id;
    }

    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (
      !this.canAccess(
        assignments,
        { teamId: dto.teamId ?? null, departmentId: dto.departmentId ?? null, team: dto.teamId ? { departmentId: resolvedDepartmentId } : null },
        "create",
      )
    ) {
      throw new ForbiddenException("Not permitted to create an event here");
    }

    if (dto.seasonId) {
      const season = await db.season.findUnique({ where: { id: dto.seasonId } });
      if (!season) {
        throw new NotFoundException("Season not found");
      }
      if (season.departmentId !== resolvedDepartmentId) {
        throw new BadRequestException("Season does not belong to this event's department");
      }
    }
    if (dto.venueId) {
      const venue = await db.venue.findUnique({ where: { id: dto.venueId } });
      if (!venue) {
        throw new NotFoundException("Venue not found");
      }
    }

    const event = await db.event.create({
      data: {
        tenantId: context.tenantId,
        teamId: dto.teamId,
        departmentId: dto.departmentId,
        seasonId: dto.seasonId,
        venueId: dto.venueId,
        title: dto.title,
        description: dto.description,
        type: dto.type ?? "OTHER",
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
      },
      include: EVENT_INCLUDE,
    });
    return this.toDto(event, true);
  }

  async update(id: string, dto: UpdateEventDto): Promise<EventDto> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.event.findUnique({ where: { id }, include: EVENT_INCLUDE });
    if (!existing) {
      throw new NotFoundException("Event not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.canAccess(assignments, existing, "update")) {
      throw new ForbiddenException("Not permitted to update this event");
    }

    const finalStartsAt = dto.startsAt ?? existing.startsAt.toISOString();
    const finalEndsAt = dto.endsAt ?? existing.endsAt.toISOString();
    this.assertValidDateRange(finalStartsAt, finalEndsAt);

    const targetDepartmentId = existing.teamId ? existing.team!.departmentId : existing.departmentId!;
    if (dto.seasonId) {
      const season = await db.season.findUnique({ where: { id: dto.seasonId } });
      if (!season) {
        throw new NotFoundException("Season not found");
      }
      if (season.departmentId !== targetDepartmentId) {
        throw new BadRequestException("Season does not belong to this event's department");
      }
    }
    if (dto.venueId) {
      const venue = await db.venue.findUnique({ where: { id: dto.venueId } });
      if (!venue) {
        throw new NotFoundException("Venue not found");
      }
    }

    const event = await db.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        seasonId: dto.seasonId,
        venueId: dto.venueId,
      },
      include: EVENT_INCLUDE,
    });
    return this.toDto(event, true);
  }

  async remove(id: string): Promise<void> {
    const context = this.requireContext();
    const db = getTenantPrisma(context.tenantId);
    const existing = await db.event.findUnique({ where: { id }, include: EVENT_INCLUDE });
    if (!existing) {
      throw new NotFoundException("Event not found");
    }
    const assignments = await this.roleAssignments.load(context.tenantId, context.personId!);
    if (!this.canAccess(assignments, existing, "update")) {
      throw new ForbiddenException("Not permitted to delete this event");
    }
    await db.event.delete({ where: { id } });
  }
}
